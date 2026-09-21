import { putMediaObject } from "@/lib/adapters/media-library.adapter.server";
import { transcodeToWavBuffer } from "@/lib/audio.server";
import { logger } from "@/lib/logger.server";
import { objectExists } from "@/lib/object-storage.server";

/**
 * Twilio-friendly WAV sidecars for IVR prompts.
 *
 * The workspace audio library stores mono 44.1 kHz MP3. Twilio re-encodes an
 * MP3 before it plays, but streams a WAV as-is — one source of first-audio
 * delay. Each prompt gets a WAV sidecar under `ivr-wav/`, written next to the
 * MP3 at upload time and preferred at playback when present. The MP3 stays the
 * canonical library object: the sidecar is derived and best-effort, so a
 * transcode failure never fails an upload or a call.
 */

const IVR_WAV_PREFIX = "ivr-wav";
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|ogg|oga|aac|flac|webm|mp4)$/i;

/** `ivr-wav/<workspace>/<base>.wav` for a library file like `<base>.mp3`. */
export function ivrWavObjectKey(workspace: string, fileName: string): string {
  const base = fileName.replace(AUDIO_EXTENSION, "");
  return `${IVR_WAV_PREFIX}/${workspace}/${base}.wav`;
}

export function isWavFileName(fileName: string): boolean {
  return /\.wav$/i.test(fileName);
}

/**
 * Best-effort: transcode the stored MP3 to a WAV sidecar. A failure is logged
 * and swallowed — the MP3 is still the object every caller falls back to.
 */
export async function writeIvrWavSidecar(
  workspace: string,
  fileName: string,
  mp3Buffer: Buffer,
): Promise<void> {
  if (isWavFileName(fileName)) return;
  try {
    const wav = await transcodeToWavBuffer(mp3Buffer);
    if (wav.length === 0) return;
    await putMediaObject(
      "workspaceAudio",
      ivrWavObjectKey(workspace, fileName),
      wav,
      { contentType: "audio/wav", cacheControl: "60", upsert: true },
    );
  } catch (error) {
    logger.error("IVR WAV sidecar failed", error);
  }
}

/**
 * Object key to sign for IVR prompt playback: the WAV sidecar when it exists,
 * otherwise the stored file. Never throws — a lookup failure falls back to the
 * original object rather than failing the call.
 */
export async function resolveIvrPromptObjectKey(
  workspace: string,
  fileName: string,
): Promise<string> {
  const original = `${workspace}/${fileName}`;
  if (isWavFileName(fileName)) return original;
  try {
    const wavKey = ivrWavObjectKey(workspace, fileName);
    if (await objectExists("workspaceAudio", wavKey)) return wavKey;
  } catch (error) {
    logger.error("IVR WAV lookup failed", error);
  }
  return original;
}
