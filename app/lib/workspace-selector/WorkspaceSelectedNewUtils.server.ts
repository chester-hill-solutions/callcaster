
import { data as routeData, redirect } from "react-router";
import { parseCSV } from "@/lib/utils";
import { bulkCreateContacts } from "@/lib/database/contact.server";
import { getWorkspacePhoneNumbers } from "@/lib/database/workspace.server";
import {
  DEFAULT_WEEKDAY_CALLING_SCHEDULE,
  getDefaultCampaignDates,
} from "@/lib/campaign-setup-steps";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { Contact } from "@/lib/types";
import { Database, Json } from "@/lib/db-types";
import { logger } from "@/lib/logger.server";
import { eq } from "drizzle-orm";
import {
  campaign_audience as campaignAudienceTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { getWorkspaceTwilioPortalConfig } from "@/lib/database/workspace-twilio-config.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import {
  CAMPAIGN_PRODUCT_GOAL_VALUES,
  campaignTypeForProductGoal,
  type CampaignProductGoal,
} from "@/lib/campaign-goals";

type CampaignType =
  | "live_call"
  | "message"
  | "robocall"
  | "simple_ivr"
  | "complex_ivr";

interface CampaignAudienceParams {
  campaignId: string;
  audienceId: string;
}

interface RemoveCampaignAudienceParams {
  id: string;
}

interface NewAudienceParams {
  formData: FormData;
  workspaceId: string;
  headers: Headers;
  campaignId?: string;
  contacts?: Array<Contact>;
  userId: string;
}

interface NewCampaignParams {
  formData: FormData;
  workspaceId: string;
  headers: Headers;
}

async function insertCampaignAudience({ campaignId, audienceId }: CampaignAudienceParams) {
  try {
    await db.insert(campaignAudienceTable).values({
      campaign_id: Number.parseInt(campaignId, 10),
      audience_id: Number.parseInt(audienceId, 10),
      created_at: new Date().toISOString(),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}

async function removeCampaignAudience({ id }: RemoveCampaignAudienceParams) {
  try {
    await db
      .delete(campaignAudienceTable)
      .where(eq(campaignAudienceTable.audience_id, Number.parseInt(id, 10)));
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function handleNewAudience({
  formData,
  workspaceId,
  headers,
  campaignId,
  contacts = [],
  userId,
}: NewAudienceParams) {
  const newAudienceName = formData.get("audience-name") as string;
  const tdb = createTenantDb(workspaceId);

  try {
    const createAudienceRows = await tdb.audience.insert({
      name: newAudienceName,
      created_at: new Date().toISOString(),
      is_conditional: false,
      status: "draft",
      total_contacts: 0,
    });
    const createAudienceData = createAudienceRows[0];
    if (!createAudienceData) {
      throw new Error("Failed to create audience");
    }

    if (campaignId) {
      const { error: campaignInsertError } = await insertCampaignAudience({
        campaignId,
        audienceId: createAudienceData.id.toString(),
      });
      if (campaignInsertError) {
        await removeCampaignAudience({ id: createAudienceData.id.toString() });
        throw campaignInsertError;
      }
    }

    if (contacts && contacts.length > 0) {
      const { insert } = await bulkCreateContacts(
        contacts,
        workspaceId,
        createAudienceData.id.toString(),
        userId,
      );
      if (campaignId && insert?.length) {
        const contactIds = insert.map((c) => c.id);
        await enqueueContactsForCampaign(
          parseInt(campaignId, 10),
          contactIds,
          { requeue: false },
        );
      }
    }

    return redirect(
      `/workspaces/${workspaceId}/audiences/${createAudienceData.id}`,
      { headers },
    );
  } catch (error) {
    logger.error("Error in handleNewAudience:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return routeData(
      {
        audienceData: null,
        error: errorMessage,
      },
      { status: 500, headers },
    );
  }
}

function workspaceNumberHasCapability(
  capabilities: unknown,
  key: "sms" | "voice",
): boolean {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return false;
  }
  const value = (capabilities as Record<string, unknown>)[key];
  return value === true || value === "true";
}

export async function handleNewCampaign({formData,
  workspaceId,
  headers,
}: NewCampaignParams) {
  const newCampaignName = (formData.get("campaign-name") as string | null)?.trim() ?? "";
  const campaignGoalValue = String(formData.get("campaign-goal") ?? "");
  const legacyCampaignType = String(formData.get("campaign-type") ?? "");
  const validLegacyTypes = new Set<CampaignType>([
    "live_call",
    "message",
    "robocall",
    "simple_ivr",
    "complex_ivr",
  ]);
  const newCampaignType = CAMPAIGN_PRODUCT_GOAL_VALUES.includes(
    campaignGoalValue as CampaignProductGoal,
  )
    ? campaignTypeForProductGoal(campaignGoalValue as CampaignProductGoal)
    : validLegacyTypes.has(legacyCampaignType as CampaignType)
      ? (legacyCampaignType as CampaignType)
      : null;
  logger.debug("Campaign Type: ", newCampaignType);

  if (!newCampaignName) {
    return routeData(
      { campaignData: null, error: { message: "Campaign name is required" } },
      { headers },
    );
  }
  if (!newCampaignType) {
    return routeData(
      { campaignData: null, error: { message: "Choose a campaign goal" } },
      { status: 400, headers },
    );
  }

  const { start_date, end_date } = getDefaultCampaignDates();
  const phoneNumbersResult = await getWorkspacePhoneNumbers({
    workspaceId,
  });
  const workspaceNumbers = (phoneNumbersResult.data ?? []).filter(
    (number) => Boolean(number?.phone_number),
  );

  // Q58: for voice campaigns (live_call/robocall), default the caller ID to
  // the first voice-capable rented number rather than requiring exactly one
  // workspace number to exist.
  const isVoiceCampaign = [
    "live_call",
    "robocall",
    "simple_ivr",
    "complex_ivr",
  ].includes(newCampaignType);
  const isMessageCampaign = newCampaignType === "message";

  let caller_id: string | null = null;
  if (isVoiceCampaign) {
    const voiceCapableNumber = workspaceNumbers.find((number) =>
      workspaceNumberHasCapability(number?.capabilities, "voice"),
    );
    const fallbackNumber = voiceCapableNumber ?? workspaceNumbers[0];
    caller_id = fallbackNumber?.phone_number ? String(fallbackNumber.phone_number) : null;
  } else if (workspaceNumbers.length === 1) {
    caller_id = String(workspaceNumbers[0]?.phone_number);
  }

  // Q47: default new message campaigns to messaging-service send mode once
  // the workspace's Messaging Service actually has senders attached — mirrors
  // the same readiness check/gating used on the campaign settings page
  // (settings.loader.server.ts) so we don't set a mode Twilio can't fulfill.
  // Existing campaigns and non-message campaign types are left untouched
  // (sms_send_mode stays null / from_number).
  let smsSendMode: "messaging_service" | undefined;
  let smsMessagingServiceSid: string | undefined;
  if (isMessageCampaign) {
    try {
      const [portalConfig, onboarding] = await Promise.all([
        getWorkspaceTwilioPortalConfig({ workspaceId }),
        getWorkspaceMessagingOnboardingState({ workspaceId }),
      ]);
      const messagingServiceSid = portalConfig.messagingServiceSid?.trim() || null;
      const messagingServiceReady = workspaceMessagingServiceHasAvailableSenders({
        messagingServiceSid,
        attachedSenderPhoneNumbers: onboarding.messagingService.attachedSenderPhoneNumbers,
        workspaceNumbers: workspaceNumbers.map((number) => ({
          phone_number: number?.phone_number,
          capabilities: number?.capabilities as Json | null,
        })),
      });
      if (messagingServiceReady && messagingServiceSid) {
        smsSendMode = "messaging_service";
        smsMessagingServiceSid = messagingServiceSid;
      }
    } catch (readinessError) {
      // Non-fatal: fall back to leaving sms_send_mode null (from_number
      // behavior) if we can't determine MS readiness for some reason.
      logger.error(
        "Failed to resolve messaging service readiness for new campaign",
        readinessError,
      );
    }
  }

  const tdb = createTenantDb(workspaceId);
  try {
    const rows = await tdb.campaign.insert({
      title: newCampaignName,
      status: "draft",
      type: newCampaignType,
      start_date,
      end_date,
      schedule: DEFAULT_WEEKDAY_CALLING_SCHEDULE,
      caller_id,
      created_at: new Date().toISOString(),
      dial_ratio: 1,
      next_queue_order: 0,
      group_household_queue: false,
      is_active: false,
      ...(smsSendMode ? { sms_send_mode: smsSendMode } : {}),
      ...(smsMessagingServiceSid
        ? { sms_messaging_service_sid: smsMessagingServiceSid }
        : {}),
    });
    const campaignData = rows[0];
    if (!campaignData) {
      return routeData(
        { campaignData: null, error: { message: "Failed to create campaign" } },
        { headers },
      );
    }

    return redirect(
      `/workspaces/${workspaceId}/campaigns/${campaignData.id}/settings`,
    );
  } catch (campaignError) {
    const code =
      campaignError && typeof campaignError === "object" && "code" in campaignError
        ? String((campaignError as { code?: string }).code)
        : null;
    if (code === "23505") {
      return routeData(
        {
          campaignData: null,
          error: {
            message: "There is already a campaign with that name. Please use a unique campaign name.",
          },
        },
        { headers },
      );
    }
    return routeData({ campaignData: null, error: campaignError }, { headers });
  }
}
