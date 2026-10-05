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
import { and, eq, sql } from "drizzle-orm";
import { campaign_queue, message as messageTable, outreach_attempt } from "@/db/schema";
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
import { createTenantDb, withAppCurrentUser } from "@/server/tenant-db";
import {
  isDispatchAllowedAt,
  nextDispatchOpenAt,
  type DispatchPolicy,
} from "@/lib/campaign-dispatch-policy";
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
  sendPolicy: DispatchPolicy;
  campaignSmsRow?: {
    end_time: string;
    sms_send_mode?: string | null;
    sms_messaging_service_sid?: string | null;
    caller_id?: string | null;
  };
}

class CampaignSmsSendWindowClosedError extends Error {
  constructor(readonly nextOpenAt: Date) {
    super("Campaign SMS send window closed before the provider request");
    this.name = "CampaignSmsSendWindowClosedError";
  }
}

function nextCampaignSmsWindowOpenAt(policy: DispatchPolicy): Date {
  return nextDispatchOpenAt(policy) ?? new Date(Date.now() + 15 * 60 * 1000);
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
    sendPolicy,
  } = params;

  // The workspace readiness gate is NOT here (#2081). It used to be the first
  // statement of this function, so it ran once per contact and threw a
  // workspace-scoped error into the per-member rejection handler, which
  // recorded a per-row attempt failure. Five ticks of a non-ready workspace
  // then dead-lettered the entire audience. It is a workspace condition, so it
  // is now checked once per dispatch in `dispatchCampaignSmsBatch`, before any
  // row is selected, and the batch defers.
  //
  // 1:1 chat sends are a different surface (`chat_sms.server.ts`) and keep
  // their own per-send gate: one message to one person, where a deferral
  // would be worse than telling that one sender why.

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

  // The dispatch loop checks before entering this function. Its preparation
  // steps above can await database work, so check again before starting any
  // provider or outreach request. The provider callback below checks every
  // retry too, because a retry delay can cross the campaign-window boundary.
  if (!isDispatchAllowedAt(sendPolicy)) {
    await deleteMessageByClientRef(workspace, clientRef);
    return {
      kind: "deferred_send_window" as const,
      nextOpenAt: nextCampaignSmsWindowOpenAt(sendPolicy),
    };
  }

  let outreachAttemptPromise: Promise<number> | null = null;
  let outreachAttempt: number | null = null;
  let providerRequested = false;
  const sendResult = await withTwilioRetry(
    async () => {
      // The retry callback runs only after beforeAttempt passes. This prevents
      // a closed window from creating an outreach row or spending an attempt.
      outreachAttemptPromise ??= createOutreachAttempt({
        contact_id,
        campaign_id,
        queue_id,
        workspace,
        user_id,
        clientRef,
        sendPolicy,
      });
      outreachAttempt = await outreachAttemptPromise;
      // Linking and committing can cross the send window. Check once more at
      // the provider boundary; an unsent preparation is undone below.
      if (!isDispatchAllowedAt(sendPolicy)) {
        throw new CampaignSmsSendWindowClosedError(nextCampaignSmsWindowOpenAt(sendPolicy));
      }
      providerRequested = true;
      return twilio.messages.create(
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
      );
    },
    {
      workspaceId: workspace,
      operation: "messages.create.campaign",
      beforeAttempt: () => {
        if (!isDispatchAllowedAt(sendPolicy)) {
          throw new CampaignSmsSendWindowClosedError(
            nextCampaignSmsWindowOpenAt(sendPolicy),
          );
        }
      },
    },
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  if (!sendResult.ok) {
    if (sendResult.error instanceof CampaignSmsSendWindowClosedError) {
      if (outreachAttempt !== null && !providerRequested) {
        await undoUnsentOutreachAttempt({ workspace, user_id, queue_id, clientRef, outreachAttempt });
      }
      await deleteMessageByClientRef(workspace, clientRef);
      return {
        kind: "deferred_send_window" as const,
        nextOpenAt: sendResult.error.nextOpenAt,
      };
    }
    // Twilio refused: the text never left, so the intent must not block a
    // later legitimate attempt.
    await deleteMessageByClientRef(workspace, clientRef).catch((error) => {
      logger.error("campaign_sms.intent_cleanup_failed", {
        workspaceId: workspace,
        clientRef,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    throw sendResult.error;
  }

  if (outreachAttempt === null) {
    throw new Error("Twilio returned a message without starting an outreach attempt");
  }
  const message = sendResult.value;

  const messageFields = twilioMessageToPersistFields(
    {
      ...sendResult.value,
      sid: sendResult.value.sid || `failed-${to}-${Date.now()}`,
    },
    { workspace, campaign_id, contact_id, outreach_attempt_id: outreachAttempt },
  );

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
  clientRef: string;
  sendPolicy: DispatchPolicy;
}) {
  try {
    return await withAppCurrentUser(args.user_id, async (tx) => {
      const tdb = createTenantDb(args.workspace, tx);
      const attempt = await rpcCreateOutreachAttempt(tdb, {
        contactId: Number(args.contact_id),
        campaignId: Number(args.campaign_id),
        userId: args.user_id,
        workspaceId: args.workspace,
        queueId: Number(args.queue_id),
      });
      const [linked] = await tdb.message.update({
        set: { outreach_attempt_id: attempt },
        where: and(eq(messageTable.client_ref, args.clientRef), eq(messageTable.sid, pendingMessageSid(args.clientRef))),
      });
      if (!linked) throw new Error("Could not link the campaign message before sending");
      if (!isDispatchAllowedAt(args.sendPolicy)) {
        throw new CampaignSmsSendWindowClosedError(nextCampaignSmsWindowOpenAt(args.sendPolicy));
      }
      return attempt;
    });
  } catch (outreachError) {
    logger.error("Error creating outreach attempt:", outreachError);
    throw outreachError;
  }
}

/** Undo only our committed preparation when the provider was never called. */
async function undoUnsentOutreachAttempt(args: {
  workspace: string; user_id: string; queue_id: string | number;
  clientRef: string; outreachAttempt: number;
}) {
  await withAppCurrentUser(args.user_id, async (tx) => {
    const tdb = createTenantDb(args.workspace, tx);
    await deleteMessageByClientRef(args.workspace, args.clientRef, { tdb });
    const removed = await tx.delete(outreach_attempt).where(and(
      eq(outreach_attempt.id, args.outreachAttempt),
      eq(outreach_attempt.workspace, args.workspace),
    )).returning({ id: outreach_attempt.id });
    if (removed.length > 0) {
      await tdb.campaign_queue.update({
        set: { attempts: sql`greatest(${campaign_queue.attempts} - 1, 0)` },
        where: eq(campaign_queue.id, Number(args.queue_id)),
      });
    }
  });
}
