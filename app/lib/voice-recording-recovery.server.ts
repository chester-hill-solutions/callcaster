import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import type { RecordingInstance } from "twilio/lib/rest/api/v2010/account/call/recording";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { isTwilioCallHistoryReady } from "@/lib/twilio-call-history.server";
import { VoiceRecordingBindingError, voiceRecordingSource, type VoiceRecordingObservation } from "@/lib/voice-recording";
import { VOICE_RECORDING_HISTORY_LIMIT, voiceRecordingSidFromHistory } from "@/lib/voice-recording-history";
import { logger } from "@/lib/logger.server";
import type { VoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { recordRecoveredVoiceRecording } from "@/server/voice-recording-receipt.server";
import { claimVoiceRecordingRecovery, deferVoiceRecordingRecovery, readVoiceRecordingRecovery } from "@/server/voice-recording-recovery.server";
import { runVoiceRecordingCopyRecovery } from "@/lib/voice-recording-copy.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { withVoiceProviderReadBudget } from "@/lib/voice-provider-read-budget";

function matchesSource(row: VoiceRecordingOperation, source: CallInstance) {
  return source.sid === row.source_call_sid && source.accountSid === row.account_sid && source.to === row.source_to &&
    source.from === row.source_from && source.direction === row.source_direction && source.parentCallSid === row.source_parent_sid;
}

function observation(row: VoiceRecordingOperation, recordingSid: string, recording: RecordingInstance): VoiceRecordingObservation {
  if (recording.sid !== recordingSid || recording.accountSid !== row.account_sid || recording.callSid !== row.source_call_sid ||
      recording.source !== voiceRecordingSource(row.kind))
    throw new VoiceRecordingBindingError("Provider recording does not match its source");
  if (!["processing", "completed", "absent"].includes(recording.status))
    throw new VoiceRecordingBindingError("Provider recording fetch has an unsupported status");
  const identity = { requestUrl: row.callback_url, accountSid: recording.accountSid, callSid: recording.callSid,
    recordingSid: recording.sid, source: recording.source };
  if (recording.status === "absent") return { ...identity, status: "absent" };
  const duration = recording.duration;
  if (duration != null && duration !== "" && (typeof duration !== "string" || !/^(0|[1-9][0-9]*)$/.test(duration)))
    throw new VoiceRecordingBindingError("Provider recording duration is invalid");
  if (recording.channels != null && recording.channels !== 1 && recording.channels !== 2)
    throw new VoiceRecordingBindingError("Provider recording channels are invalid");
  return { ...identity,
    // GET processing cannot prove that capture is still running.
    status: recording.status === "completed" ? recording.status : undefined,
    startedAt: recording.startTime ?? undefined, durationSeconds: duration ? Number(duration) : undefined,
    channels: recording.channels ?? undefined };
}

async function readObservation(current: VoiceRecordingOperation, requireActive: () => void) {
  const client = await createOriginalVoiceAccountClient(current);
  requireActive();
  const source = await client.calls(current.source_call_sid).fetch();
  if (!matchesSource(current, source)) throw new VoiceRecordingBindingError("Recording source call identity changed");
  let recordingSid = current.provider_sid;
  if (!recordingSid) {
    if (!isTerminalStatus(normalizeProviderStatus(source.status)) || !isTwilioCallHistoryReady(source)) return null;
    requireActive();
    recordingSid = voiceRecordingSidFromHistory(current, await client.calls(current.source_call_sid).events.list({ limit: VOICE_RECORDING_HISTORY_LIMIT }));
    if (!recordingSid) return null;
  }
  requireActive();
  const resource = await client.calls(current.source_call_sid).recordings(recordingSid).fetch();
  return observation(current, recordingSid, resource);
}

/** Unknown SIDs require the saved callback nonce in completed Call Events. */
export async function reconcileVoiceRecording(owner: VoiceRecordingOperation) {
  const current = await readVoiceRecordingRecovery(owner);
  if (!current) return "pending" as const;
  const observed = await withVoiceProviderReadBudget((requireActive) => readObservation(current, requireActive),
    5000, "Recording provider verification timed out");
  if (!observed) return "pending" as const;
  const saved = await recordRecoveredVoiceRecording(current, observed);
  return saved?.terminal_at ? "closed" as const : "pending" as const;
}

export async function runVoiceRecordingLifecycleRecovery() {
  const rows = await claimVoiceRecordingRecovery();
  const counts = { examined: rows.length, closed: 0, pending: 0 };
  for (const row of rows) {
    try { counts[await reconcileVoiceRecording(row)]++; }
    catch (error) {
      counts.pending++;
      await deferVoiceRecordingRecovery(row).catch((deferError) => {
        logger.error("voice_recording.recovery_defer_failed", { operationId: row.id, error: deferError });
      });
      logger.error("voice_recording.provider_recovery_failed", { operationId: row.id, workspaceId: row.workspace, error });
    }
  }
  return counts;
}

export async function runVoiceRecordingRecovery() {
  return { lifecycle: await runVoiceRecordingLifecycleRecovery(), copies: await runVoiceRecordingCopyRecovery() };
}
