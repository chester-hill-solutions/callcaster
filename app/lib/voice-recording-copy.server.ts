import { persistCallRecordingToStorage } from "@/lib/call-recording-storage.server";
import { logger } from "@/lib/logger.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { claimVoiceRecordingCopy, deferVoiceRecordingCopy, findPendingVoiceRecordingCopies,
  finishVoiceRecordingCopy, startVoiceRecordingCopy } from "@/server/voice-recording-copy.server";
import type { VoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { enqueueCallRecordingTranscription } from "@/lib/call-recording-transcription.server";

export async function enqueueVoiceRecordingCopy(owner: VoiceRecordingOperation) {
  const claimed = await claimVoiceRecordingCopy(owner);
  if (!claimed) return false;
  try {
    await enqueueRegisteredJob({ type: RECORDING_SIDE_EFFECTS_JOB_TYPE, workspaceId: claimed.workspace,
      params: { recordingOperationId: claimed.id, leaseToken: claimed.lease_token },
      dedupe: { kind: "idempotency", key: `voice_recording_copy:${claimed.id}:${claimed.lease_token}` },
    });
    return true;
  } catch (error) {
    await deferVoiceRecordingCopy(claimed);
    throw error;
  }
}

export async function runVoiceRecordingCopy(workspaceId: string, operationId: string, leaseToken: string) {
  const current = await startVoiceRecordingCopy(workspaceId, operationId, leaseToken);
  if (!current?.provider_sid) return { copied: false };
  if (current.audio_url) {
    if (current.kind === "dial" || current.kind === "customer")
      await enqueueCallRecordingTranscription(current.workspace, current.logical_call_sid, current.audio_url, { retryOnError: true });
    return { copied: false };
  }
  try {
    const result = await persistCallRecordingToStorage({ workspaceId: current.workspace, callSid: current.logical_call_sid,
      accountSid: current.account_sid, recordingSid: current.provider_sid, existingAudioUrl: current.audio_url, storageMode: "recording" });
    const copied = await finishVoiceRecordingCopy(current, result.audioUrl);
    if (copied && (current.kind === "dial" || current.kind === "customer"))
      await enqueueCallRecordingTranscription(current.workspace, current.logical_call_sid, result.audioUrl, { retryOnError: true });
    return { copied };
  } catch (error) {
    await deferVoiceRecordingCopy(current);
    throw error;
  }
}

/** The existing one-minute voice recovery job repairs a lost callback enqueue. */
export async function runVoiceRecordingCopyRecovery() {
  const rows = await findPendingVoiceRecordingCopies();
  const counts = { examined: rows.length, enqueued: 0, pending: 0 };
  for (const row of rows) {
    try { if (await enqueueVoiceRecordingCopy(row)) counts.enqueued++; else counts.pending++; }
    catch (error) {
      counts.pending++;
      logger.error("voice_recording.copy_recovery_failed", { operationId: row.id, workspaceId: row.workspace, error });
    }
  }
  return counts;
}
