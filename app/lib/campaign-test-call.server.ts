import { eq } from "drizzle-orm";
import { campaign as campaignTable } from "@/db/schema";
import { findContactsByPhone } from "@/lib/database/contact.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { normalizePhoneNumber } from "@/lib/phone";
import { insertCallForWorkspace } from "@/lib/telephony-db.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { resolveIvrCallUrls } from "@/lib/twilio-ivr-runtime.server";
import { createTenantDb } from "@/server/tenant-db";

/** Campaign types whose test is a phone call through the IVR flow. */
export const VOICE_TEST_CAMPAIGN_TYPES = new Set(["robocall", "simple_ivr", "complex_ivr"]);

export type CampaignTestCallFailure =
  | "invalid_phone"
  | "insufficient_credits"
  | "not_found"
  | "unsupported_type"
  | "caller_id_required"
  | "no_script"
  | "call_failed";

export type CampaignTestCallResult =
  | {
      ok: true;
      to: string;
      callSid: string;
      /** True when the number matched a workspace contact, which the call row records. */
      usedContact: boolean;
    }
  | { ok: false; reason: CampaignTestCallFailure; message: string };

const FAILURE_MESSAGES: Record<CampaignTestCallFailure, string> = {
  invalid_phone: "Enter a valid phone number, including the country code.",
  insufficient_credits: "Not enough credits to place a test call.",
  not_found: "Campaign could not be loaded",
  unsupported_type: "Test calls are available for robocall and phone menu campaigns.",
  caller_id_required: "Choose a caller ID for this campaign first.",
  no_script: "Choose a script for this campaign before placing a test call.",
  call_failed: "Test call could not be placed",
};

function failure(
  reason: CampaignTestCallFailure,
  message = FAILURE_MESSAGES[reason],
): CampaignTestCallResult {
  return { ok: false, reason, message };
}

function parseTestRecipient(raw: string): string | null {
  try {
    return normalizePhoneNumber(raw);
  } catch {
    return null;
  }
}

/**
 * Place one call to a phone number through a voice campaign's real IVR flow.
 * The call row carries the campaign id so the flow and status webhook work,
 * but no outreach attempt, so results, exports, and analytics (which count
 * attempts) never see it. Credits are charged as usual.
 */
export async function sendCampaignTestCall(args: {
  workspaceId: string;
  campaignId: string | number;
  userId: string;
  to: string;
}): Promise<CampaignTestCallResult> {
  const { workspaceId, campaignId, userId } = args;

  const to = parseTestRecipient(args.to);
  if (!to) return failure("invalid_phone");

  const credits = await requireOutboundCredits(workspaceId);
  if (!credits.ok) return failure("insufficient_credits");

  const tdb = createTenantDb(workspaceId);
  const campaign = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
    columns: { id: true, type: true, caller_id: true, script_id: true },
  });
  if (!campaign) return failure("not_found");
  if (!campaign.type || !VOICE_TEST_CAMPAIGN_TYPES.has(campaign.type)) {
    return failure("unsupported_type");
  }
  const callerId = String(campaign.caller_id ?? "").trim();
  if (!callerId) return failure("caller_id_required");
  if (campaign.script_id == null) return failure("no_script");

  const [contact] = await findContactsByPhone(workspaceId, to);
  const urls = resolveIvrCallUrls(campaign.id);

  try {
    const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
    const call = await withTwilioRetry(
      () =>
        twilio.calls.create({
          to,
          from: callerId,
          url: urls.flowUrl,
          machineDetection: "Enable",
          statusCallbackEvent: ["answered", "completed"],
          statusCallback: urls.statusCallback,
        }),
      { workspaceId, operation: "calls.create.test" },
    );
    const inserted = await insertCallForWorkspace(workspaceId, {
      sid: call.sid,
      to,
      from: callerId,
      campaign_id: campaign.id,
      contact_id: contact?.id ?? null,
      outreach_attempt_id: null,
    });
    if (!inserted) {
      throw new Error("Failed to insert call row");
    }
    logger.info("campaign.test_call", {
      workspaceId,
      campaignId: String(campaign.id),
      userId,
      callSid: call.sid,
      usedContact: Boolean(contact),
    });
    return { ok: true, to, callSid: call.sid, usedContact: Boolean(contact) };
  } catch (error) {
    logger.error("campaign.test_call_failed", {
      workspaceId,
      campaignId: String(campaignId),
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return failure("call_failed", twilioErrorUserMessage(error));
  }
}
