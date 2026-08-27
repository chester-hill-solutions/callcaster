import { Campaign, OutreachAttempt } from "@/lib/types";
import { cancelQueuedMessagesForCampaign } from "@/lib/database/call-actions.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { db } from "@/server/db";
import { shouldUpdateOutreachDisposition } from "@/lib/outreach-disposition";
import { markContactLineType } from "@/lib/twilio-lookup.server";
import { alertSmsGeoPermissionBlocked } from "@/lib/twilio-geo-permissions.server";
import {
  isTerminalSmsStatus,
  normalizeSmsStatus,
  pickRawTwilioSmsStatus,
  smsStatusToOutreachDisposition,
} from "@/lib/sms-status";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS, debitAmountFromCredits } from "@/lib/pricing";
import { smsKey } from "@/lib/billing-keys";
import type { TwilioSmsStatusWebhook, OutreachDisposition } from "@/lib/twilio.types";
import { campaign as campaignTable, campaign_queue as campaignQueueTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { findMessageBySid } from "@/lib/message-db.server";
import {
  findCallBySid,
  findOutreachAttemptById,
  findOutreachAttemptWithCampaignType,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import {
  billTerminalCallStatus,
  resolveCallOutreachContext,
} from "@/lib/twilio-call-status.server";
import type { TwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { persistCallRecordingToStorage } from "@/lib/call-recording-storage.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE } from "@/lib/worker/job-types.server";
import { isBatchTranscriptionEnabled } from "@/lib/worker/handlers/elevenlabs-batch-transcribe.server";

/** Terminal Twilio call statuses and the outreach disposition they imply. */
const CALL_STATUS_TO_DISPOSITION: Record<string, string> = {
  completed: "completed",
  busy: "busy",
  "no-answer": "no-answer",
  failed: "failed",
  canceled: "canceled",
};

/**
 * `event` is the callback the ROUTE already parsed (#1243 E1) — the worker no
 * longer re-derives its own `underCase` view of the same body. Jobs queued
 * before E1 get it re-derived from their stored `twilioParams` by
 * `voiceSideEffectsParamsSchema`, so this always receives a real union member.
 */
export async function runCallStatusSideEffects(args: {
  callSid: string;
  event: TwilioVoiceCallback;
}): Promise<{ ok: true }> {
  const callRow = await findCallBySid(args.callSid);
  if (!callRow) {
    throw new Error(`Call ${args.callSid} not found for side effects`);
  }

  await billTerminalCallStatus(callRow);

  const callStatus = args.event.callStatus;
  const { outreachAttemptId, workspaceId } = await resolveCallOutreachContext(callRow);

  const currentAttempt =
    outreachAttemptId != null && workspaceId
      ? await findOutreachAttemptWithCampaignType(workspaceId, outreachAttemptId)
      : null;

  const billingWorkspace = currentAttempt?.workspace ?? workspaceId;
  if (currentAttempt && billingWorkspace) {
    await emitPredictiveBroadcast(billingWorkspace, {
      contact_id: currentAttempt.contact_id,
      status: callStatus,
    });

    // Provider-terminal statuses stamp a disposition so every call yields a
    // results row even when the browser never reaches /api/hangup (callee
    // hangs up, tab closes) and the agent picks nothing (#1218). The
    // transition guard keeps AMD "voicemail" and other terminal values from
    // being downgraded, and an explicit agent choice via /api/questions
    // bypasses this guard entirely, so it always wins.
    const terminalDisposition = CALL_STATUS_TO_DISPOSITION[callStatus.toLowerCase()];
    if (
      terminalDisposition &&
      shouldUpdateOutreachDisposition({
        currentDisposition: currentAttempt.disposition,
        nextDisposition: terminalDisposition,
      })
    ) {
      await updateOutreachAttemptForWorkspace(billingWorkspace, outreachAttemptId!, {
        disposition: terminalDisposition,
        ended_at: new Date().toISOString(),
      });
    }
  }

  // A provider-terminal status must collapse the contact's queue entry exactly
  // like /api/hangup does; otherwise a callee hang-up leaves the agent's
  // nextRecipient (and the whole queue view) pointing at a finished contact
  // while an agent hang-up clears it (#1362). Idempotent: if the agent already
  // hung up, the guarded dequeue_contact RPC no-ops on dequeued rows. The
  // assignee id is required for the RPC to cover assigned rows, so take it
  // from the queue row itself — a webhook has no acting user.
  if (
    CALL_STATUS_TO_DISPOSITION[callStatus.toLowerCase()] &&
    callRow.contact_id != null
  ) {
    const dequeueWorkspace = workspaceId ?? callRow.workspace;
    if (!dequeueWorkspace) {
      logger.warn("call_status.dequeue_skipped", {
        callSid: args.callSid,
        reason: "no workspace",
      });
      return { ok: true };
    }
    const tdb = createTenantDb(dequeueWorkspace);
    const [queueRow, campaign] = await Promise.all([
      callRow.campaign_id
        ? tdb.campaign_queue.findFirst({
            where: and(
              eq(campaignQueueTable.contact_id, callRow.contact_id),
              eq(campaignQueueTable.campaign_id, callRow.campaign_id),
            ),
            columns: { assigned_to_user_id: true },
          })
        : Promise.resolve(null),
      callRow.campaign_id
        ? tdb.campaign.findFirst({
            where: eq(campaignTable.id, callRow.campaign_id),
            columns: { group_household_queue: true },
          })
        : Promise.resolve(null),
    ]);
    await dequeueQueueEntry({
      by: { contactId: callRow.contact_id },
      workspaceId: dequeueWorkspace,
      household: campaign?.group_household_queue ?? false,
      userId: queueRow?.assigned_to_user_id ?? null,
      reason: "Call completed",
      exec: tdb,
    });
  }

  return { ok: true };
}

export async function runSmsStatusSideEffects(args: {
  messageSid: string;
  twilioParams: Partial<TwilioSmsStatusWebhook>;
}): Promise<{ ok: true }> {
  const sid = args.messageSid;
  const rawStatus = pickRawTwilioSmsStatus(args.twilioParams);
  const messageData = await findMessageBySid(sid);

  if (!messageData?.workspace) {
    throw new Error(`Message ${sid} not found for side effects`);
  }

  const messageStatus =
    normalizeSmsStatus(rawStatus ?? messageData.status) ?? "failed";

  const errorCode =
    typeof args.twilioParams.ErrorCode === "string" &&
    args.twilioParams.ErrorCode.trim()
      ? Number.parseInt(args.twilioParams.ErrorCode, 10)
      : messageData.error_code;

  if (errorCode === 30006 && messageData.contact_id) {
    await markContactLineType({
      workspaceId: messageData.workspace,
      contactId: messageData.contact_id,
      lineType: "landline",
    });
  }

  // 21408 = destination region not enabled for messaging on this subaccount.
  // SMS geo-permissions have no public API, so the toggle is Console-only —
  // raise a (rate-limited) ops alert naming the fix instead of letting sends
  // fail one by one.
  if (errorCode === 21408) {
    await alertSmsGeoPermissionBlocked({
      workspaceId: messageData.workspace,
      messageSid: sid,
      to: messageData.to,
    });
  }

  if (messageData.workspace && isTerminalSmsStatus(messageStatus)) {
    const numSegments = Math.max(
      1,
      Number.parseInt(String(messageData.num_segments ?? "1"), 10) || 1,
    );
    const numMedia = Number.parseInt(String(messageData.num_media ?? "0"), 10) || 0;
    const isMms = numMedia > 0;
    const amount = isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * numSegments;
    const note = isMms
      ? `MMS ${sid} ${messageStatus}`
      : `SMS ${sid} ${messageStatus} (${numSegments} segment${numSegments === 1 ? "" : "s"})`;
    await insertTransactionHistoryIdempotent(db, {
      workspaceId: messageData.workspace,
      type: "DEBIT",
      amount: debitAmountFromCredits(amount),
      note,
      idempotencyKey: smsKey(sid),
      messageSid: sid,
    });
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
      now > new Date(outreachData.campaign.end_date) &&
      typeof messageData.campaign_id === "number" &&
      messageData.workspace
    ) {
      const twilio = await createWorkspaceTwilioInstance({
        workspace_id: messageData.workspace,
      });
      await cancelQueuedMessagesForCampaign(twilio, messageData.campaign_id);
    }
  }

  const webhookResult = await sendWorkspaceWebhookNotification({
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

  return { ok: true };
}

export async function runRecordingSideEffects(args: {
  callSid: string;
  event: TwilioVoiceCallback;
}): Promise<{ ok: true }> {
  const callRow = await findCallBySid(args.callSid);
  if (!callRow?.workspace) {
    throw new Error(`Call ${args.callSid} not found for recording side effects`);
  }

  // The parser classifies any payload carrying a recording field as
  // `recording`, so a non-recording event provably has nothing to persist —
  // no raw-params fallback needed here.
  const recording = args.event.kind === "recording" ? args.event : null;
  const recordingSid = recording?.recordingSid ?? null;
  const recordingDuration = recording?.recordingDuration ?? null;
  const accountSid = args.event.accountSid;

  const enrichment: Record<string, string> = {};
  if (recordingSid) {
    enrichment.recording_sid = recordingSid;
  }
  if (recordingDuration) {
    enrichment.recording_duration = recordingDuration;
  }

  if (recordingSid && accountSid) {
    const persistResult = await persistCallRecordingToStorage({
      workspaceId: callRow.workspace,
      callSid: args.callSid,
      accountSid,
      recordingSid,
      existingAudioUrl: callRow.audio_url,
    });

    if (persistResult.ok && !persistResult.skipped) {
      enrichment.audio_url = persistResult.audioUrl;
      // Batch transcription is default-off pending an undecided product policy
      // (see `batchTranscription` in @/lib/coaching-schemas). Suppress the
      // enqueue entirely rather than queueing work nothing will bill for.
      if (await isBatchTranscriptionEnabled(callRow.workspace)) {
        try {
          await enqueueRegisteredJob({
            type: ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
            workspaceId: callRow.workspace,
            params: { callSid: args.callSid },
            dedupe: { kind: "idempotency", key: `elevenlabs_batch:${args.callSid}` },
          });
        } catch (error) {
          logger.warn("elevenlabs_batch_transcribe.enqueue_failed", {
            callSid: args.callSid,
            workspaceId: callRow.workspace,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (!persistResult.ok) {
      logger.warn("call_recording.persist_skipped", {
        callSid: args.callSid,
        workspaceId: callRow.workspace,
        reason: persistResult.reason,
        error: persistResult.error,
      });
    }
  } else if (recordingSid && !accountSid) {
    logger.warn("call_recording.missing_account_sid", {
      callSid: args.callSid,
      workspaceId: callRow.workspace,
    });
  }

  if (Object.keys(enrichment).length > 0) {
    await updateCallBySid(callRow.workspace, args.callSid, enrichment);
  }

  logger.debug("Recording side effects completed", {
    callSid: args.callSid,
    workspaceId: callRow.workspace,
    audioUrlPersisted: Boolean(enrichment.audio_url),
  });

  return { ok: true };
}
