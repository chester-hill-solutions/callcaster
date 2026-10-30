import { eq } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { VoiceRecordingBindingError, voiceRecordingReceiptSchema, type VoiceRecordingReceipt } from "@/lib/voice-recording";
import { withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";

/** An authenticated nonce binds acceptance even if it beats the create response. */
export async function recordVoiceRecordingReceipt(owner: VoiceRecordingOperation, input: VoiceRecordingReceipt) {
  const parsed = voiceRecordingReceiptSchema.safeParse(input);
  if (!parsed.success) throw new VoiceRecordingBindingError("Invalid recording receipt");
  const receipt = parsed.data;
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (!current.send_started_at || receipt.requestUrl !== current.callback_url || receipt.accountSid !== current.account_sid ||
        receipt.callSid !== current.source_call_sid || receipt.source !== (current.kind === "dial" ? "DialVerb" : "StartCallRecordingAPI") ||
        current.provider_sid && current.provider_sid !== receipt.recordingSid)
      throw new VoiceRecordingBindingError("Recording receipt does not match its instruction");
    // Late progress and duplicate completion cannot erase a terminal receipt.
    if (current.terminal_at) return current;
    const terminal = receipt.status === "completed" || receipt.status === "absent";
    const [saved] = await tx.update(recordings).set({
      provider_sid: receipt.recordingSid, provider_status: receipt.status,
      state: current.state === "creating" ? "accepted" : current.state,
      recording_started_at: current.recording_started_at ?? receipt.startedAt,
      recording_duration_seconds: receipt.durationSeconds ?? current.recording_duration_seconds,
      channels: receipt.channels ?? current.channels,
      terminal_at: terminal ? new Date() : null,
      lease_expires_at: terminal ? new Date() : current.lease_expires_at, updated_at: new Date(),
    }).where(eq(recordings.id, current.id)).returning();
    if (!saved) throw new Error("Recording receipt was not saved");
    return saved;
  });
}
