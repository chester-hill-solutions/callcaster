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
import { recheckCampaignCompletion } from "@/lib/campaign-settle-recheck.server";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS, debitAmountFromCredits } from "@/lib/pricing";
import { smsKey } from "@/lib/billing-keys";
import type { TwilioSmsStatusWebhook, TwilioSmsStatus, OutreachDisposition } from "@/lib/twilio.types";
import { campaign as campaignTable, campaign_queue as campaignQueueTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { dequeueQueueEntry } from "@/lib/campaign-queue-db.server";
import { findMessageBySid, updateMessageBySid, type MessageRow } from "@/lib/message-db.server";
import { parseSmsProviderCount, smsProviderQuantityFields } from "@/lib/sms-provider-quantities";
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
import {
  ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
} from "@/lib/worker/job-types.server";
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
  if (currentAttempt && billingWorkspace && outreachAttemptId != null) {
    await emitPredictiveBroadcast(billingWorkspace, {
      contact_id: currentAttempt.contact_id,
      status: callStatus,
    });

    // Provider-terminal statuses stamp a disposition so every call yields a
    // results row even when the browser never reaches /api/hangup (callee
    // hangs up, tab closes) and the agent picks nothing. The
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
      await updateOutreachAttemptForWorkspace(billingWorkspace, outreachAttemptId, {
        disposition: terminalDisposition,
        ended_at: new Date().toISOString(),
      });
    }
  }

  // A provider-terminal status must collapse the contact's queue entry exactly
  // like /api/hangup does; otherwise a callee hang-up leaves the agent's
  // nextRecipient (and the whole queue view) pointing at a finished contact
  // while an agent hang-up clears it. Idempotent: if the agent already
  // hung up, the guarded dequeue_contact RPC no-ops on dequeued rows. The
  // assignee id is required for the RPC to cover assigned rows, so take it
  // from the queue row itself — a webhook has no acting user. Test calls can
  // name a campaign and contact, but they deliberately have no outreach
  // attempt and must leave the matching queue row untouched.
  if (
    outreachAttemptId != null &&
    CALL_STATUS_TO_DISPOSITION[callStatus.toLowerCase()] &&
    callRow.contact_id != null &&
    callRow.campaign_id != null
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
      by: { contactId: callRow.contact_id, campaignId: callRow.campaign_id },
      workspaceId: dequeueWorkspace,
      household: campaign?.group_household_queue ?? false,
      userId: queueRow?.assigned_to_user_id ?? null,
      reason: "Call completed",
      exec: tdb,
    });
  }

  return { ok: true };
}

async function billTerminalSms(message: MessageRow, status: TwilioSmsStatus): Promise<void> {
  const workspaceId = message.workspace;
  if (!workspaceId || !isTerminalSmsStatus(status)) return;

  let segments = parseSmsProviderCount(message.num_segments);
  let media = parseSmsProviderCount(message.num_media);
  if (media == null || (media === 0 && (segments == null || segments === 0))) {
    const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
    const remote = await twilio.messages(message.sid).fetch().catch((error: unknown) => {
      logger.warn("billing.sms_metadata_unavailable", { workspaceId, sid: message.sid, status });
      throw new Error(`SMS billing metadata unavailable for ${message.sid}`, { cause: error });
    });
    if (remote.sid !== message.sid || (message.account_sid && remote.accountSid !== message.account_sid)) {
      throw new Error(`Unexpected provider message identity for ${message.sid}`);
    }
    segments = parseSmsProviderCount(remote.numSegments);
    media = parseSmsProviderCount(remote.numMedia);
    const saved = await updateMessageBySid(workspaceId, message.sid, smsProviderQuantityFields(remote));
    if (!saved) throw new Error(`Message ${message.sid} not found while saving billing metadata`);
  }

  if (media == null || (media === 0 && (segments == null || segments === 0))) {
    logger.warn("billing.sms_metadata_unavailable", { workspaceId, sid: message.sid, status });
    throw new Error(`SMS billing metadata unavailable for ${message.sid}`);
  }

  const isMms = media > 0;
  const amount = isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * (segments ?? 0);
  const note = isMms
    ? `MMS ${message.sid} ${status}`
    : `SMS ${message.sid} ${status} (${segments} segment${segments === 1 ? "" : "s"})`;
  await insertTransactionHistoryIdempotent(db, {
    workspaceId,
    type: "DEBIT",
    amount: debitAmountFromCredits(amount),
    note,
    idempotencyKey: smsKey(message.sid),
    messageSid: message.sid,
    campaignId: message.campaign_id ?? null,
  });
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

  // Missing provider metadata defers billing, while delivery results still
  // settle. Throw after the independent effects so the durable job retries.
  let billingFailure: { error: unknown } | null = null;
  try {
    await billTerminalSms(messageData, messageStatus);
  } catch (error) {
    billingFailure = { error };
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

  await enqueueRegisteredJob({
    type: WEBHOOK_DELIVERY_JOB_TYPE,
    workspaceId: messageData.workspace,
    dedupe: { kind: "idempotency", key: `outbound_sms:${sid}:${messageStatus}` },
    params: {
      workspaceId: messageData.workspace,
      eventCategory: "outbound_sms",
      eventType: "UPDATE",
      optional: true,
      payload: {
        type: "outbound_sms",
        record: {
          message_sid: messageData.sid,
          from: messageData.from,
          to: messageData.to,
          body: messageData.body,
          num_media: messageData.num_media,
          status: messageStatus,
          date_updated: messageData.date_updated,
        },
        old_record: { message_sid: messageData.sid },
      },
    },
  });

  // #2048: a message campaign is complete only when every message has settled.
  // The dispatch chain stops when the local queue empties, so this callback is
  // the moment the last message can actually open the gate. Re-check on EVERY
  // status, not just terminal ones: a non-terminal callback still carries fresh
  // message state, and asking is cheap because the RPC is the only work done.
  // Inbound replies have campaign_id NULL, so they fall out here.
  await recheckCampaignCompletion({
    workspaceId: messageData.workspace,
    campaignId: messageData.campaign_id,
    reason: `sms_status:${messageStatus}`,
  });

  if (billingFailure) throw billingFailure.error;

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

  // Narrowed by the throw above; bound once so the closure below keeps it.
  const workspaceId: string = callRow.workspace;

  /**
   * Writes a SNAPSHOT, not the live object. This is called twice — once before
   * the copy so a failure is attributable, once after so `audio_url` lands —
   * and `enrichment` keeps mutating between them. Passing the live reference
   * would make both writes identical at read time.
   */
  async function writeEnrichment(): Promise<void> {
    if (Object.keys(enrichment).length === 0) return;
    await updateCallBySid(workspaceId, args.callSid, { ...enrichment });
  }

  if (recordingSid && accountSid) {
    // Persist the recording identity BEFORE attempting the copy, so a copy that
    // fails still leaves a row the repair sweep can find and re-drive while
    // Twilio still holds the source. Then attempt the copy, which throws on
    // failure so this job FAILS and the worker retries (#2166) rather than
    // reporting success while the audio is lost.
    await writeEnrichment();

    const persistResult = await persistCallRecordingToStorage({
      workspaceId: callRow.workspace,
      callSid: args.callSid,
      accountSid,
      recordingSid,
      existingAudioUrl: callRow.audio_url,
    });

    if (!persistResult.skipped) {
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
    }
  } else if (recordingSid && !accountSid) {
    logger.warn("call_recording.missing_account_sid", {
      callSid: args.callSid,
      workspaceId: callRow.workspace,
    });
  }

  await writeEnrichment();

  logger.debug("Recording side effects completed", {
    callSid: args.callSid,
    workspaceId: callRow.workspace,
    audioUrlPersisted: Boolean(enrichment.audio_url),
  });

  return { ok: true };
}
