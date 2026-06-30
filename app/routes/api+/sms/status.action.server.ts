import { Campaign, OutreachAttempt } from "@/lib/types";
import {
  cancelQueuedMessagesForCampaign,
  createWorkspaceTwilioInstance,
} from "@/lib/database.server";
import { createClient } from "@supabase/supabase-js";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { isInboundMessageDirection } from "@/lib/chat-conversation-sort";
import { logger } from "@/lib/logger.server";
import { shouldUpdateOutreachDisposition } from "@/lib/outreach-disposition";
import { validateTwilioWebhookForMessageSid } from "@/lib/twilio-webhook.server";
import type { Database } from "@/lib/database.types";
import {
  isTerminalSmsStatus,
  normalizeSmsStatus,
  pickRawTwilioSmsStatus,
  smsStatusToOutreachDisposition,
} from "@/lib/sms-status";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { SMS_SEGMENT_CREDITS, debitAmountFromCredits } from "@/lib/pricing";
import { smsKey } from "@/lib/billing-keys";
import type { TwilioSmsStatusWebhook, OutreachDisposition } from "@/lib/twilio.types";
import { campaign as campaignTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findMessageBySid, updateMessageBySid } from "@/lib/message-db.server";
import {
  findOutreachAttemptById,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { createTenantDb } from "@/server/tenant-db";

import type { ActionFunctionArgs } from "react-router";

/**
 * Canonical Twilio outbound SMS status webhook (`POST /api/sms/status`).
 * Merged from Edge `sms-status`; new sends use `${BASE_URL}/api/sms/status`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  try {
    const previewFormData = await request.formData();
    const previewPayload = Object.fromEntries(
      previewFormData.entries(),
    ) as Partial<TwilioSmsStatusWebhook>;
    const previewSid = previewPayload.SmsSid;
    const previewStatus = pickRawTwilioSmsStatus(previewPayload);

    if (!previewSid || !previewStatus) {
      return routeData(
        { error: "Missing required fields: SmsSid and SmsStatus or MessageStatus" },
        { status: 400 },
      );
    }

    const validation = await validateTwilioWebhookForMessageSid({
      request,
      supabase,
      smsSid: previewSid,
      params: previewPayload as Record<string, string>,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const payload = validation.params as Partial<TwilioSmsStatusWebhook>;
    const sid = payload.SmsSid;
    const rawStatus = pickRawTwilioSmsStatus(payload);

    if (!sid || !rawStatus) {
      return routeData(
        { error: "Missing required fields: SmsSid and SmsStatus or MessageStatus" },
        { status: 400 },
      );
    }

    const preUpdateMessage = await findMessageBySid(sid);

    if (!preUpdateMessage?.workspace) {
      throw new Error("Failed to find message workspace for SMS status webhook");
    }

    if (isInboundMessageDirection(preUpdateMessage.direction)) {
      return routeData({ message: preUpdateMessage, outreach: null });
    }

    const messageStatus = normalizeSmsStatus(rawStatus) ?? "failed";
    if (!normalizeSmsStatus(rawStatus)) {
      logger.warn("Unknown SMS status from Twilio webhook", { sid, status: rawStatus });
    }

    const accountSidFromWebhook =
      typeof payload.AccountSid === "string" && payload.AccountSid.trim()
        ? payload.AccountSid.trim()
        : null;

    const messageData = await updateMessageBySid(preUpdateMessage.workspace, sid, {
      status: messageStatus,
      ...(accountSidFromWebhook ? { account_sid: accountSidFromWebhook } : {}),
    });

    if (!messageData) {
      logger.error("Error updating message for sid", { sid });
      return routeData({ error: "Failed to update message" }, { status: 500 });
    }

    // Debit billing for SMS (campaign, API/chat, or any outbound) when terminal status
    if (messageData.workspace && isTerminalSmsStatus(messageStatus)) {
      try {
        const numSegments = Math.max(
          1,
          Number.parseInt(String(messageData.num_segments ?? "1"), 10) || 1,
        );
        await insertTransactionHistoryIdempotent({
          workspaceId: messageData.workspace,
          type: "DEBIT",
          amount: debitAmountFromCredits(SMS_SEGMENT_CREDITS * numSegments),
          note: `SMS ${sid} ${messageStatus} (${numSegments} segment${numSegments === 1 ? "" : "s"})`,
          idempotencyKey: smsKey(sid),
          messageSid: sid,
        });
      } catch (transactionError) {
        logger.error("Failed to create SMS transaction:", transactionError);
        return routeData({ error: "Failed to record SMS billing" }, { status: 500 });
      }
    }

    let outreachData:
      | (OutreachAttempt & { campaign: Partial<Campaign> })
      | null = null;
    if (messageData.outreach_attempt_id && messageData.workspace) {
      const disposition: OutreachDisposition =
        smsStatusToOutreachDisposition(messageStatus);

      const currentAttempt = await findOutreachAttemptById(
        messageData.workspace,
        messageData.outreach_attempt_id,
      );
      const shouldSkip = !shouldUpdateOutreachDisposition({
        currentDisposition: currentAttempt?.disposition ?? null,
        nextDisposition: disposition,
      });

      if (!shouldSkip) {
        const outreachResult = await updateOutreachAttemptForWorkspace(
          messageData.workspace,
          messageData.outreach_attempt_id,
          { disposition },
        );

        if (!(outreachResult instanceof Response)) {
          const tdb = createTenantDb(messageData.workspace);
          const campaign = outreachResult.campaign_id
            ? await tdb.campaign.findFirst({
                where: eq(campaignTable.id, outreachResult.campaign_id),
                columns: { end_date: true },
              })
            : null;
          outreachData = {
            ...outreachResult,
            campaign: { end_date: campaign?.end_date ?? null },
          } as OutreachAttempt & { campaign: Partial<Campaign> };
        } else {
          logger.error("Error updating outreach attempt:", outreachResult.statusText);
        }
      }
    }
    if (outreachData && outreachData.campaign?.end_date) {
      const now = new Date();
      if (
        outreachData.campaign?.end_date &&
        now > new Date(outreachData.campaign.end_date) &&
        typeof messageData.campaign_id === "number" &&
        messageData.workspace
      ) {
        // Use the workspace subaccount client (ADR-0011) instead of the parent account.
        const twilio = await createWorkspaceTwilioInstance({
          supabase,
          workspace_id: messageData.workspace,
        });
        await cancelQueuedMessagesForCampaign(
          twilio,
          supabase,
          messageData.campaign_id,
        );
      }
    }
    logger.debug("Message status update", { messageData });

    if (messageData.workspace) {
      const webhookResult = await sendWorkspaceWebhookNotification({
        supabaseClient: supabase,
        workspaceId: messageData.workspace,
        eventCategory: "outbound_sms",
        eventType: "UPDATE",
        payload: {
          type: "outbound_sms",
          record: {
            message_sid: messageData.sid,
            from: messageData.from,
            to: messageData.to,
            body: messageData.body,
            num_media: messageData.num_media,
            status: messageData.status,
            date_updated: messageData.date_updated,
          },
          old_record: { message_sid: messageData.sid },
        },
      });
      if (!webhookResult.success) {
        logger.error("SMS status webhook delivery failed", webhookResult.error);
      }
    }
    return routeData({ message: messageData, outreach: outreachData });
  } catch (error) {
    logger.error("Unexpected error:", error);
    return routeData({ error: "An unexpected error occurred" }, { status: 500 });
  }
};
