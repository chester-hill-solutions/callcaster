import { claimVoiceAudioSend, deferVoiceAudioConnection, failUnacceptedVoiceAudio, findVoiceAudioConnection,
  recordVoiceAudioProvider, type VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { isDefiniteVoiceCreateRejection } from "@/lib/voice-credit-dispatch.server";
import { logger } from "@/lib/logger.server";

export class VoiceAudioConnectionPendingError extends Error {
  constructor(readonly connectionId: string, cause: unknown) {
    super("Agent audio connection needs provider verification", { cause });
    this.name = "VoiceAudioConnectionPendingError";
  }
}

/** One before-send checkpoint permits one provider POST, without a customer hold. */
export async function dispatchVoiceAudioConnection(row: VoiceAudioConnection, create: (row: VoiceAudioConnection) => Promise<{ sid: string }>) {
  if (row.provider_sid) return { ok: true as const, connection: row, replayed: true };
  const claimed = await claimVoiceAudioSend(row);
  if (!claimed.ok) return claimed;
  const started = claimed.connection;
  let accepted = false;
  try {
    const physical = await create(started);
    accepted = true;
    return { ok: true as const, connection: await recordVoiceAudioProvider(started, physical.sid), replayed: false };
  } catch (error) {
    try {
      const known = await findVoiceAudioConnection(started.id);
      if (known?.provider_sid) return { ok: true as const, connection: known, replayed: true };
    } catch (readError) { logger.error("voice_audio.receipt_read_failed", readError); }
    if (!accepted && isDefiniteVoiceCreateRejection(error)) {
      await failUnacceptedVoiceAudio(started);
      throw error;
    }
    try { await deferVoiceAudioConnection(started); }
    catch (deferError) { logger.error("voice_audio.uncertainty_record_failed", deferError); }
    throw new VoiceAudioConnectionPendingError(started.id, error);
  }
}
