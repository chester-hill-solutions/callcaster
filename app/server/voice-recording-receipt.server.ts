import { eq } from "drizzle-orm";
import { workspace_voice_recording_operation as recordings } from "@/db/schema";
import { VoiceRecordingBindingError, voiceRecordingReceiptSchema, type VoiceRecordingObservation, type VoiceRecordingReceipt } from "@/lib/voice-recording";
import { withVoiceRecordingOperation, type VoiceRecordingOperation } from "./voice-recording-operation.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";

const observationSchema = voiceRecordingReceiptSchema.partial({ status: true });

async function saveReceipt(tx: CreditTransaction, current: VoiceRecordingOperation, receipt: VoiceRecordingObservation) {
  if (!current.send_started_at || receipt.requestUrl !== current.callback_url || receipt.accountSid !== current.account_sid ||
      receipt.callSid !== current.source_call_sid || receipt.source !== (current.kind === "dial" ? "DialVerb" : "StartCallRecordingAPI") ||
      current.provider_sid && current.provider_sid !== receipt.recordingSid)
    throw new VoiceRecordingBindingError("Recording receipt does not match its instruction");
  // Late progress and duplicate completion cannot erase a terminal receipt.
  if (current.terminal_at) return current;
  const terminal = receipt.status === "completed" || receipt.status === "absent";
  const [saved] = await tx.update(recordings).set({
    provider_sid: receipt.recordingSid, provider_status: receipt.status ?? current.provider_status,
    state: current.state === "creating" ? "accepted" : current.state,
    recording_started_at: current.recording_started_at ?? receipt.startedAt,
    recording_duration_seconds: receipt.durationSeconds ?? current.recording_duration_seconds,
    channels: receipt.channels ?? current.channels,
    terminal_at: terminal ? new Date() : null,
    lease_expires_at: terminal ? new Date() : current.lease_expires_at, last_error: null, updated_at: new Date(),
  }).where(eq(recordings.id, current.id)).returning();
  if (!saved) throw new Error("Recording receipt was not saved");
  return saved;
}

/** An authenticated nonce binds acceptance even if it beats the create response. */
export async function recordVoiceRecordingReceipt(owner: VoiceRecordingOperation, input: VoiceRecordingReceipt) {
  const parsed = voiceRecordingReceiptSchema.safeParse(input);
  if (!parsed.success) throw new VoiceRecordingBindingError("Invalid recording receipt");
  return withVoiceRecordingOperation(owner, (tx, current) => saveReceipt(tx, current, parsed.data));
}

/** A create acknowledgement preserves identity even after its worker lease changes. */
export async function recordVoiceRecordingProvider(owner: VoiceRecordingOperation, input: unknown) {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) throw new VoiceRecordingBindingError("Invalid recording create acknowledgement");
  return withVoiceRecordingOperation(owner, (tx, current) => saveReceipt(tx, current, parsed.data));
}

/** A processing API response proves identity, never an in-progress recording. */
export async function recordRecoveredVoiceRecording(owner: VoiceRecordingOperation, input: VoiceRecordingObservation) {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) throw new VoiceRecordingBindingError("Invalid recording observation");
  return withVoiceRecordingOperation(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || current.lease_expires_at.getTime() <= Date.now() ||
        current.source_parent_sid !== null || current.terminal_at) return null;
    return saveReceipt(tx, current, parsed.data);
  });
}
