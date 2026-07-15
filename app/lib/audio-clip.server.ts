/**
 * Render a reusable cut ("clip") from an object already in the audio library.
 *
 * A clip is byte-for-byte the same kind of object as an upload: it goes
 * through the same mono 44.1kHz MP3 encode, lands in the same bucket under the
 * same `${workspaceId}/${name}.mp3` key, and is therefore usable anywhere a
 * filename is accepted (voicedrop, hold audio, inbound greeting, IVR step).
 *
 * Saving as a NEW clip is the default because a filename is how live campaigns
 * point at audio: re-rendering over an existing key changes what callers hear
 * without touching any campaign. Overwriting is possible but must be asked for
 * explicitly, and the caller is expected to have shown findAudioUsage() first.
 */
import {
  AudioUploadError,
  NORMALIZED_AUDIO_CONTENT_TYPE,
  NORMALIZED_AUDIO_EXTENSION,
  getSafeMediaBaseName,
  probeAudioDurationMs,
  trimAudioBuffer,
} from "@/lib/audio.server";
import { resolveAvailableBaseName } from "@/lib/audio-upload";
import { listMediaObjects } from "@/lib/adapters/media-library.adapter.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { upsertAudioMetadata } from "@/lib/database/workspace-audio-metadata.server";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import {
  ObjectExistsError,
  downloadObject,
  uploadObject,
} from "@/lib/object-storage.server";

export type CreateAudioClipInput = {
  userId: string;
  workspaceId: string;
  /** Library object the clip is cut from, extension included. */
  sourceFileName: string;
  startMs: number;
  endMs: number;
  /** Desired name for a "new" clip. Ignored when mode is "overwrite". */
  name?: string;
  mode: "new" | "overwrite";
};

/** Strip the extension the same way an upload name would be sanitized. */
function baseNameOf(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export async function createWorkspaceAudioClip(input: CreateAudioClipInput) {
  const { userId, workspaceId, sourceFileName, startMs, endMs, mode } = input;

  const role = await getUserRole({ user: { id: userId }, workspaceId });
  if (!role || role.role === MemberRole.Caller) {
    return { ok: false as const, error: "Not authorized", status: 403 };
  }

  try {
    const sourceBuffer = await downloadObject(
      "workspaceAudio",
      `${workspaceId}/${sourceFileName}`,
    );

    // Range validation lives in trimAudioBuffer so the rule holds for every
    // caller, not just this route.
    const clip = await trimAudioBuffer(sourceBuffer, { startMs, endMs });

    const targetFileName = await resolveTargetFileName(input);

    await uploadObject(
      "workspaceAudio",
      `${workspaceId}/${targetFileName}`,
      clip.buffer,
      {
        cacheControl: "60",
        contentType: clip.contentType,
        // "new" must never clobber a key some campaign already points at; an
        // overwrite was explicitly asked for, so let it through.
        upsert: mode === "overwrite",
      },
    );

    const durationMs = await probeAudioDurationMs(clip.buffer);

    await upsertAudioMetadata({
      workspaceId,
      fileName: targetFileName,
      origin: "clip",
      durationMs,
      sizeBytes: clip.buffer.length,
      contentType: clip.contentType,
      createdBy: userId,
      clip: { sourceFileName, startMs, endMs },
    });

    return { ok: true as const, fileName: targetFileName, durationMs };
  } catch (error) {
    logger.error("createWorkspaceAudioClip failed", error);

    // ObjectExistsError's message embeds the storage key, so it must not reach
    // a user. A name collision is an ordinary thing to hit.
    if (error instanceof ObjectExistsError) {
      return {
        ok: false as const,
        error: "An audio file with that name already exists. Choose a different name.",
        status: 409,
      };
    }
    if (error instanceof AudioUploadError) {
      return { ok: false as const, error: error.message, status: error.status };
    }
    return {
      ok: false as const,
      error: "Failed to save the clip.",
      status: 500,
    };
  }
}

async function resolveTargetFileName(input: CreateAudioClipInput) {
  const { workspaceId, sourceFileName, name, mode } = input;

  if (mode === "overwrite") {
    return sourceFileName;
  }

  // Default to "<source>-clip" so a user who just wants a cut is not forced to
  // invent a name.
  const desired = getSafeMediaBaseName(
    name?.trim() ? name : `${baseNameOf(sourceFileName)}-clip`,
  );

  const existing = await listMediaObjects("workspaceAudio", workspaceId);
  const takenBaseNames = existing.map((item) => baseNameOf(item.name));

  const available = resolveAvailableBaseName(desired, takenBaseNames);
  return `${available}.${NORMALIZED_AUDIO_EXTENSION}`;
}

export { NORMALIZED_AUDIO_CONTENT_TYPE };
