import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalSnapshot,
} from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  buildOnboardingStepsForState,
  DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
  deriveWorkspaceMessagingReadiness,
} from "@/lib/messaging-onboarding.server";
import type {
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioPortalPageSnapshot,
  WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";

export interface AdminWorkspaceTwilioLoaderPageData {
  twilioAccountInfo: {
    sid: string;
    friendlyName: string;
    status: string;
    type: string;
    dateCreated: string;
  } | null;
  twilioNumbers: Array<{
    sid: string;
    phoneNumber: string;
    friendlyName: string;
    capabilities: {
      voice: boolean;
      sms: boolean;
      mms: boolean;
      fax: boolean;
    };
    voiceReceiveMode?: string;
    smsApplicationSid?: string;
    voiceApplicationSid?: string;
    addressRequirements?: string;
    status?: string;
  }>;
  twilioUsage: Array<{
    category: string;
    description: string;
    usage: string;
    usageUnit: string;
    price: string;
    startDate?: string;
    endDate?: string;
  }>;
  portalSnapshot: WorkspaceTwilioPortalPageSnapshot;
}

export async function loadTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
): Promise<AdminWorkspaceTwilioLoaderPageData> {
  let twilioAccountInfo: AdminWorkspaceTwilioLoaderPageData["twilioAccountInfo"] =
    null;
  let twilioNumbers: AdminWorkspaceTwilioLoaderPageData["twilioNumbers"] = [];
  let twilioUsage: AdminWorkspaceTwilioLoaderPageData["twilioUsage"] = [];

  const portalSnapshot = await getWorkspaceTwilioPortalSnapshot({
    supabaseClient,
    workspaceId,
  }).catch((error): WorkspaceTwilioPortalPageSnapshot => {
    logger.error("Error fetching Twilio portal snapshot:", error);
    const onboarding = {
      ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
      steps: buildOnboardingStepsForState(DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE),
    };
    return {
      config: {
        trafficClass: "unknown",
        throughputProduct: "none",
        multiTenancyMode: "none",
        trafficShapingEnabled: false,
        defaultMessageIntent: null,
        sendMode: "from_number",
        messagingServiceSid: null,
        onboardingStatus: "not_started",
        supportNotes: "",
        updatedAt: null,
        updatedBy: null,
        auditTrail: [],
      } satisfies WorkspaceTwilioOpsConfig,
      detectedTrafficClass: "unknown",
      metrics: {
        recentOutboundCount: 0,
        rawFromCount: 0,
        messagingServiceCount: 0,
        statusCounts: {},
        numberTypes: [],
      },
      recommendations: [],
      supportRequestSummary: "Unable to generate a Twilio support summary.",
      syncSnapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 0,
        numberTypes: [],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: null,
        lastSyncStatus: "never_synced",
        lastSyncError: null,
      } satisfies WorkspaceTwilioSyncSnapshot,
      onboarding,
      readiness: deriveWorkspaceMessagingReadiness({
        onboarding,
        workspaceNumbers: [],
        recentOutboundCount: 0,
      }),
    };
  });

  try {
    const { data: workspace } = await supabaseClient
      .from("workspace")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (workspace?.twilio_data?.sid) {
      const twilio = await createWorkspaceTwilioInstance({
        supabase: supabaseClient,
        workspace_id: workspaceId,
      });
      const [account, numbers, usageRecords] = await Promise.all([
        twilio.api.v2010.accounts(workspace.twilio_data.sid).fetch(),
        twilio.incomingPhoneNumbers.list({ limit: 20 }),
        twilio.usage.records.list(),
      ]);

      twilioAccountInfo = {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type,
        dateCreated: account.dateCreated.toISOString(),
      };

      twilioNumbers = numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        capabilities: number.capabilities,
        voiceReceiveMode: number.voiceReceiveMode,
        smsApplicationSid: number.smsApplicationSid,
        voiceApplicationSid: number.voiceApplicationSid,
        addressRequirements: number.addressRequirements,
        status: number.status,
      }));

      twilioUsage = usageRecords.map((record) => ({
        category: record.category,
        description: record.description,
        usage: record.usage,
        usageUnit: record.usageUnit,
        price: record.price.toString(),
        startDate: record.startDate?.toISOString(),
        endDate: record.endDate?.toISOString(),
      }));
    }
  } catch (error) {
    logger.error("Error fetching Twilio information:", error);
  }

  return {
    twilioAccountInfo,
    twilioNumbers,
    twilioUsage,
    portalSnapshot,
  };
}
