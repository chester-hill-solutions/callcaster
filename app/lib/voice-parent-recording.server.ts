import type { RecordingInstance } from "twilio/lib/rest/api/v2010/account/call/recording";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { withVoiceProviderReadBudget } from "@/lib/voice-provider-read-budget";
import { isDefiniteVoiceCreateRejection } from "@/lib/voice-credit-dispatch.server";
import { voiceWebhookDeliveryUrl } from "@/lib/twilio-webhook-delivery";
import { VoiceRecordingBindingError } from "@/lib/voice-recording";
import { logger } from "@/lib/logger.server";
import { claimVoiceParentRecordingSend, failUnacceptedVoiceParentRecording, findVoiceParentRecording,
  prepareVoiceParentRecording, readVoiceParentRecordingTarget } from "@/server/voice-parent-recording.server";
import { deferVoiceRecordingWork, findVoiceRecordingOperation, type VoiceRecordingOperation } from "@/server/voice-recording-operation.server";
import { recordVoiceRecordingProvider } from "@/server/voice-recording-receipt.server";
import type { VoiceAudioConnection } from "@/server/voice-audio-connection.server";

export class VoiceParentRecordingPendingError extends Error {
  constructor(readonly operationId: string, cause: unknown) {
    super("Parent recording needs provider verification", { cause }); this.name = "VoiceParentRecordingPendingError";
  }
}

function acknowledgement(owner: VoiceRecordingOperation, recording: RecordingInstance) {
  if (recording.duration != null && recording.duration !== "" && !/^(0|[1-9][0-9]*)$/.test(recording.duration))
    throw new VoiceRecordingBindingError("Parent recording create duration is invalid");
  return { requestUrl: owner.callback_url, accountSid: recording.accountSid, callSid: recording.callSid,
    recordingSid: recording.sid, source: recording.source,
    status: recording.status === "processing" ? undefined : recording.status,
    startedAt: recording.startTime ?? undefined, channels: recording.channels ?? undefined,
    durationSeconds: recording.duration == null || recording.duration === "" ? undefined : Number(recording.duration) };
}

/** Acceptance is durable identity, never permission to redirect or retire audio. */
export async function ensureVoiceParentRecording(connection: VoiceAudioConnection) {
  const existing = await findVoiceParentRecording(connection);
  if (existing?.send_started_at) return { operation: existing, replayed: true };
  const target = await readVoiceParentRecordingTarget(connection);
  const root = await withVoiceProviderReadBudget(async requireActive => {
    const client = await createOriginalVoiceAccountClient(target.connection); requireActive();
    const physical = await client.calls(target.connection.original_agent_sid ?? "").fetch(); requireActive();
    if (physical.status !== "in-progress")
      throw new VoiceRecordingBindingError("Parent recording requires its live original provider root");
    return { client, physical };
  }, 5000, "Parent recording source verification timed out");
  const prepared = await prepareVoiceParentRecording(connection, root.physical);
  if (prepared.send_started_at) return { operation: prepared, replayed: true };
  const started = await claimVoiceParentRecordingSend(connection, prepared);
  if (!started) {
    const current = await findVoiceRecordingOperation(prepared.id);
    if (!current) throw new Error("Parent recording checkpoint disappeared");
    return { operation: current, replayed: true };
  }
  let accepted = false;
  try {
    const recording = await root.client.calls(started.source_call_sid).recordings.create({
      recordingChannels: "dual", recordingTrack: "both", trim: "do-not-trim",
      recordingStatusCallback: voiceWebhookDeliveryUrl(started.callback_url), recordingStatusCallbackMethod: "POST",
      recordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
    });
    accepted = true;
    return { operation: await recordVoiceRecordingProvider(started, acknowledgement(started, recording)), replayed: false };
  } catch (error) {
    try {
      const saved = await findVoiceRecordingOperation(started.id);
      if (saved?.provider_sid) return { operation: saved, replayed: true };
    } catch (readError) { logger.error("voice_recording.parent_receipt_read_failed", readError); }
    if (!accepted && isDefiniteVoiceCreateRejection(error)) {
      await failUnacceptedVoiceParentRecording(started);
      throw error;
    }
    await deferVoiceRecordingWork(started, "Parent recording creation or acknowledgement needs recovery",
      current => current.state === "creating" && !current.provider_sid)
      .catch(deferError => logger.error("voice_recording.parent_defer_failed", deferError));
    throw new VoiceParentRecordingPendingError(started.id, error);
  }
}
