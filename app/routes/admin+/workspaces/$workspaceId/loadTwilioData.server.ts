import {
  buildDefaultWorkspaceTwilioPortalSnapshot,
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalSnapshot,
} from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import type { WorkspaceTwilioPortalSnapshot } from "@/lib/types";

export interface TwilioPageData {
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
  portalSnapshot: WorkspaceTwilioPortalSnapshot;
}

export async function loadTwilioData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
): Promise<TwilioPageData> {



  let twilioAccountInfo: TwilioPageData["twilioAccountInfo"] = null;
  let twilioNumbers: TwilioPageData["twilioNumbers"] = [];
  let twilioUsage: TwilioPageData["twilioUsage"] = [];

  const portalSnapshot = await getWorkspaceTwilioPortalSnapshot({
    supabaseClient,
    workspaceId,
  }).catch((error): WorkspaceTwilioPortalSnapshot => {
    logger.error("Error fetching Twilio portal snapshot:", error);
    return buildDefaultWorkspaceTwilioPortalSnapshot();
  });

  try {
    const { data: workspace } = await supabaseClient
      .from("workspace")
      .select("*")
      .eq("id", workspaceId)
      .single();

    const adminTwilioCreds = readTwilioWorkspaceCredentials(workspace?.twilio_data);
    if (adminTwilioCreds?.sid) {
      const twilio = await createWorkspaceTwilioInstance({
        supabase: supabaseClient,
        workspace_id: workspaceId,
      });
      const [account, numbers, usageRecords] = await Promise.all([
        twilio.api.v2010.accounts(adminTwilioCreds.sid).fetch(),
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
