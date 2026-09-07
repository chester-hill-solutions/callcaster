/**
 * Campaign SMS send primitive: send a single message to one contact,
 * create outreach attempt, persist, and dequeue.
 *
 * Extracted from /api/sms route so both HTTP and worker dispatch use the same path.
 */
import { buildTwilioOutboundSmsCreateParams } from "@/lib/twilio-outbound-sms.server";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import {
  countCampaignMessagesToPhone,
  deleteMessageByClientRef,
  pendingMessageSid,
  resolveMessageByClientRef,
  type MessageRow,
} from "@/lib/message-db.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { notifyOps } from "@/lib/ops-alert.server";
import {
  persistMessageRecord,
  twilioMessageToPersistFields,
  buildMessageInsert,
} from "@/lib/sms-send.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { assertWorkspaceCanSendSms } from "@/lib/twilio-readiness.server";
import { resolveTwilioSmsMessagingServiceSid } from "@/lib/sms-send-resolve";
import { rpcCreateOutreachAttempt } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";

export const DUPLICATE_SMS_DEQUEUED_REASON = "Duplicate SMS prevented";
export const OPTED_OUT_SMS_DEQUEUED_REASON = "Contact opted out";
export const LANDLINE_SMS_DEQUEUED_REASON = "Landline — cannot receive SMS";

export interface SendSingleSmsParams {
  body: string;
  to: string;
  from: string;
  media: string[];
  campaign_id: string;
  workspace: string;
  contact_id: string | number;
  queue_id: number | string;
  user_id: string;
  portalConfig: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  messagingServiceSidFromRequest: string | null;
  campaignSmsRow?: {
    end_time: string;
    sms_send_mode?: string | null;
    sms_messaging_service_sid?: string | null;
    caller_id?: string | null;
  };
}

export async function hasDuplicateCampaignSms(args: {
  workspaceId: string;
  campaignId: string;
  to: string;
}): Promise<boolean> {
  const count = await countCampaignMessagesToPhone(
    args.workspaceId,
    args.campaignId,
    args.to,
  );
  return count > 0;
}

/**
 * Send one campaign SMS to one contact, creating outreach attempt,
 * persisting the message, and dequeuing the queue entry.
 */
export async function sendSingleCampaignSms(params: SendSingleSmsParams) {
  const {
    body, to, from, media, campaign_id, workspace,
    contact_id, queue_id, user_id, portalConfig,
    messageIntent, messagingServiceSidFromRequest, campaignSmsRow,
  } = params;

  await assertWorkspaceCanSendSms({ workspaceId: workspace });

  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspace });

  const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
    explicitRequestSid: messagingServiceSidFromRequest,
    campaignSmsSendMode: campaignSmsRow?.sms_send_mode,
    campaignSmsMessagingServiceSid: campaignSmsRow?.sms_messaging_service_sid,
    portalConfig,
  });

  // Intent row BEFORE the provider call (#1582): from here on the contact is
  // deduped by hasDuplicateCampaignSms even if this process dies mid-send,
  // and the status webhook can attach the real SID if the resolve below fails.
  const clientRef = crypto.randomUUID();
  const intent = await persistMessageRecord(workspace, {
    sid: pendingMessageSid(clientRef),
    client_ref: clientRef,
    body,
    to,
    from,
    direction: "outbound-api",
    status: "queued",
    date_created: new Date(),
    workspace,
    campaign_id,
    contact_id,
    ...(media.length > 0 ? { outbound_media: media } : {}),
  });
  if (intent.error) {
    // Nothing was sent; surface it and leave the contact queued for retry.
    throw new Error(`Could not record the message before sending: ${intent.error.message}`);
  }

  const [message, outreachAttempt] = await Promise.all([
    withTwilioRetry(
      () =>
        twilio.messages.create(
          buildTwilioOutboundSmsCreateParams({
            body,
            to,
            from,
            media,
            statusCallback: `${env.BASE_URL()}/api/sms/status`,
            portalConfig,
            messageIntent,
            explicitMessagingServiceSid: resolvedMessagingServiceSid,
            campaignSmsSendMode: campaignSmsRow?.sms_send_mode,
            campaignSmsMessagingServiceSid: campaignSmsRow?.sms_messaging_service_sid,
          }),
        ),
      { workspaceId: workspace, operation: "messages.create.campaign" },
    ).catch((e) => ({ error: e })),
    createOutreachAttempt({ contact_id, campaign_id, queue_id, workspace, user_id }),
  ]);

  if ('error' in message) {
    // Twilio refused: the text never left, so the intent must not block a
    // later legitimate attempt.
    await deleteMessageByClientRef(workspace, clientRef).catch((error) => {
      logger.error("campaign_sms.intent_cleanup_failed", {
        workspaceId: workspace,
        clientRef,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    throw message.error;
  }

  const messageFields = twilioMessageToPersistFields(
    { ...message, sid: message.sid || `failed-${to}-${Date.now()}` },
    { workspace, campaign_id, contact_id },
  );

  const outreachUpdate = await updateOutreachAttemptForWorkspace(
    workspace,
    outreachAttempt,
    { disposition: "completed" },
  );
  if (outreachUpdate instanceof Response) {
    throw new Error(await outreachUpdate.text());
  }

  const [persisted] = await Promise.all([
    resolveMessageByClientRef(workspace, clientRef, {
      ...(buildMessageInsert(messageFields) as Partial<MessageRow>),
      sid: messageFields.sid,
    })
      .then((row) => (row ? { data: [row], error: null } : { data: null, error: { message: "intent row not found" } }))
      .catch((error: unknown) => ({ data: null, error: { message: error instanceof Error ? error.message : String(error) } })),
    // Dequeue regardless: Twilio has the text. With no row to dedupe against,
    // a still-queued entry would send it again on the next dispatch.
    dequeueQueueEntry({
      by: { id: Number(queue_id) },
      userId: user_id,
      reason: "SMS message sent",
    }),
  ]);

  if (persisted.error) {
    // The text went out and the intent row still carries its placeholder SID.
    // The status webhook resolves it by from/to; alert so the gap is visible
    // if that never happens.
    logger.error("campaign_sms.persist_failed", {
      workspaceId: workspace,
      campaignId: campaign_id,
      contactId: contact_id,
      sid: message.sid,
      error: persisted.error.message,
    });
    void notifyOps({
      event: "sms.persist_failed",
      summary: `Campaign SMS ${message.sid} was sent but its message row could not be written; it will not be billed or shown until reconciled`,
      dedupeKey: `sms_persist_failed:${campaign_id}`,
      workspaceId: workspace,
      context: { campaignId: campaign_id, contactId: contact_id, sid: message.sid, error: persisted.error.message },
    });
  }

  return { message, persisted: !persisted.error };
}

async function createOutreachAttempt(args: {
  contact_id: string | number;
  campaign_id: string | number;
  queue_id: string | number;
  workspace: string;
  user_id: string;
}) {
  const tdb = createTenantDb(args.workspace);
  try {
    return await rpcCreateOutreachAttempt(tdb, {
      contactId: Number(args.contact_id),
      campaignId: Number(args.campaign_id),
      userId: args.user_id,
      workspaceId: args.workspace,
      queueId: Number(args.queue_id),
    });
  } catch (outreachError) {
    logger.error("Error creating outreach attempt:", outreachError);
    throw outreachError;
  }
}
