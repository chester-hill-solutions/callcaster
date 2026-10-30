import { isSinglePartCallRecording } from "@/server/voice-recording-batch.server";
import { isBatchTranscriptionEnabled } from "@/lib/worker/handlers/elevenlabs-batch-transcribe.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE } from "@/lib/worker/job-types.server";
import { logger } from "@/lib/logger.server";

/** Keep the existing default-off policy and one logical-call job key. */
export async function enqueueCallRecordingTranscription(workspaceId: string, callSid: string, audioUrl: string) {
  try {
    if (!await isBatchTranscriptionEnabled(workspaceId) || !await isSinglePartCallRecording(workspaceId, callSid, audioUrl)) return;
    await enqueueRegisteredJob({ type: ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE, workspaceId,
      params: { callSid }, dedupe: { kind: "idempotency", key: `elevenlabs_batch:${callSid}` } });
  } catch (error) {
    logger.warn("elevenlabs_batch_transcribe.enqueue_failed", {
      callSid, workspaceId, error: error instanceof Error ? error.message : String(error),
    });
  }
}
