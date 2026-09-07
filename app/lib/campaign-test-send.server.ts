import { isOptedOutRecipient } from "@/lib/chat-sms-guards.server";
import { sendMessage } from "@/lib/chat-sms.server";
import { findContactsByPhone } from "@/lib/database/contact.server";
import { logger } from "@/lib/logger.server";
import {
  processTemplateTags,
  SAMPLE_TEMPLATE_CONTACT,
} from "@/lib/message-templates";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { normalizePhoneNumber } from "@/lib/phone";
import { loadCampaignSmsDispatchData } from "@/lib/sms-campaign-db.server";
import type { CampaignSmsSendMode } from "@/lib/sms-campaign-send-mode";
import { messageCampaignRequiresCallerId } from "@/lib/sms-send-resolve";
import { toUserMessage } from "@/lib/user-message";

export type CampaignTestSendFailure =
  | "invalid_phone"
  | "insufficient_credits"
  | "empty_message"
  | "caller_id_required"
  | "opted_out"
  | "send_failed";

export type CampaignTestSendResult =
  | {
      ok: true;
      to: string;
      sid: string;
      body: string;
      /** True when no workspace contact matched the number. */
      usedSampleContact: boolean;
    }
  | { ok: false; reason: CampaignTestSendFailure; message: string };

const FAILURE_MESSAGES: Record<CampaignTestSendFailure, string> = {
  invalid_phone: "Enter a valid phone number, including the country code.",
  insufficient_credits: "Not enough credits to send a test message.",
  empty_message: "Add message text or media before sending a test.",
  caller_id_required: "Choose a sending number for this campaign first.",
  opted_out: "That number has opted out of messages from this workspace.",
  send_failed: "Test message could not be sent",
};

function failure(
  reason: CampaignTestSendFailure,
  message = FAILURE_MESSAGES[reason],
): CampaignTestSendResult {
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
 * Send one message campaign's content to a single phone number through the
 * real chat SMS sender. The row it writes has no campaign id, so the test
 * never shows up in campaign results, and credits are charged as usual.
 */
export async function sendCampaignTestSms(args: {
  workspaceId: string;
  campaignId: string | number;
  userId: string;
  to: string;
}): Promise<CampaignTestSendResult> {
  const { workspaceId, campaignId, userId } = args;

  const to = parseTestRecipient(args.to);
  if (!to) return failure("invalid_phone");

  const credits = await requireOutboundCredits(workspaceId);
  if (!credits.ok) return failure("insufficient_credits");

  const campaign = await loadCampaignSmsDispatchData(workspaceId, campaignId);
  const hasBody = campaign.body_text.trim().length > 0;
  if (!hasBody && campaign.message_media.length === 0) {
    return failure("empty_message");
  }

  const callerId = String(campaign.campaign.caller_id ?? "").trim();
  if (messageCampaignRequiresCallerId(campaign.campaign.sms_send_mode) && !callerId) {
    return failure("caller_id_required");
  }

  const [contact] = await findContactsByPhone(workspaceId, to);
  const contactId = contact?.id == null ? undefined : String(contact.id);
  if (await isOptedOutRecipient(workspaceId, to, contactId)) {
    return failure("opted_out");
  }

  const body = hasBody
    ? processTemplateTags(campaign.body_text, contact ?? SAMPLE_TEMPLATE_CONTACT)
    : " ";
  const mediaUrls = await Promise.all(
    campaign.message_media.map((item) =>
      createSignedObjectUrl("messageMedia", `${workspaceId}/${item}`, 3600),
    ),
  );

  try {
    const { message } = await sendMessage({
      body,
      to,
      from: callerId,
      media: mediaUrls.length > 0 ? JSON.stringify(mediaUrls.filter(Boolean)) : "",
      workspace: workspaceId,
      contact_id: contactId ?? "",
      user: { id: userId },
      sendMode: (campaign.campaign.sms_send_mode as CampaignSmsSendMode | null) ?? null,
      messagingServiceSid: campaign.campaign.sms_messaging_service_sid,
    });
    logger.info("campaign.test_send", {
      workspaceId,
      campaignId: String(campaignId),
      userId,
      sid: message.sid,
      usedSampleContact: !contact,
    });
    return { ok: true, to, sid: message.sid, body, usedSampleContact: !contact };
  } catch (error) {
    logger.error("campaign.test_send_failed", {
      workspaceId,
      campaignId: String(campaignId),
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return failure("send_failed", toUserMessage(error, FAILURE_MESSAGES.send_failed));
  }
}
