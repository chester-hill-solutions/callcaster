/**
 * Campaign SMS send primitive: send a single message to one contact,
 * create outreach attempt, persist, and dequeue.
 *
 * Extracted from /api/sms route so both HTTP and worker dispatch use the same path.
 */
import { buildTwilioOutboundSmsCreateParams } from "@/lib/twilio-outbound-sms.server";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { countCampaignMessagesToPhone } from "@/lib/message-db.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { notifyOps } from "@/lib/ops-alert.server";
import {
  persistMessageRecord,
  twilioMessageToPersistFields,
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
    persistMessageRecord(workspace, messageFields),
    // Dequeue regardless: Twilio has the text. With no row to dedupe against,
    // a still-queued entry would send it again on the next dispatch.
    dequeueQueueEntry({
      by: { id: Number(queue_id) },
      userId: user_id,
      reason: "SMS message sent",
    }),
  ]);

  if (persisted.error) {
    // The text went out but nothing records it: the status webhook will not
    // find the SID and the send is never billed. Until the outbox (#1578)
    // makes this recoverable, it must at least be loud.
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
