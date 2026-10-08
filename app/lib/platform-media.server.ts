import {
  AudioUploadError,
  getSafeMediaBaseName,
  normalizeUploadedAudio,
} from "@/lib/audio.server";
import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import {
  getSignedMediaUrl,
  listMediaObjects,
  putMediaObject,
} from "@/lib/adapters/media-library.adapter.server";
import { writeIvrWavSidecar } from "@/lib/ivr-wav.server";
import {
  createSignedObjectUrls,
  ObjectExistsError,
} from "@/lib/object-storage.server";
import { voicemailListPrefix, voicemailObjectPath } from "@/lib/voicemail-media.server";

const SIGNED_URL_TTL_SECONDS = 3600;

async function listWorkspaceMediaWithUrls(
  workspaceId: string,
  listPrefix: string,
  objectPathFor: (name: string) => string,
) {
  try {
    const mediaData = await listMediaObjects("workspaceAudio", listPrefix, {
      sortBy: { column: "created_at", order: "desc" },
    });

    if (mediaData.length === 0) {
      return { ok: true as const, audios: [] };
    }

    const mediaPaths = mediaData.map((media) => objectPathFor(media.name));
    const signedUrls = await createSignedObjectUrls(
      "workspaceAudio",
      mediaPaths,
      SIGNED_URL_TTL_SECONDS,
    );

    const audios = mediaData.map((media) => {
      const path = objectPathFor(media.name);
      const signedUrl = signedUrls.find(
        (entry) => entry.path === path,
      )?.signedUrl;
      return {
        name: media.name,
        id: media.id,
        created_at: media.created_at,
        updated_at: media.updated_at,
        signed_url: signedUrl ?? null,
      };
    });

    return { ok: true as const, audios };
  } catch (error) {
    const message = error instanceof Error ? error.message : "List media failed";
    logger.warn("listWorkspaceMediaWithUrls error", error);
    return { ok: false as const, error: message, status: 500 };
  }
}

export async function listWorkspaceAudiosApi(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  // Library prompt files only: caller voicemails (`voicemail/<ws>/`) and
  // Twilio call recordings (`call-recordings/<ws>/`) live under their own
  // top-level prefixes, so this prefix can never list them.
  return listWorkspaceMediaWithUrls(
    workspaceId,
    workspaceId,
    (name) => `${workspaceId}/${name}`,
  );
}

export async function listWorkspaceVoicemailsApi(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  return listWorkspaceMediaWithUrls(
    workspaceId,
    voicemailListPrefix(workspaceId),
    (name) => voicemailObjectPath(workspaceId, name),
  );
}

export async function uploadWorkspaceAudioApi(
  userId: string,
  workspaceId: string,
  mediaName: string,
  file: File,
) {
  const role = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role === MemberRole.Caller) {
    return { ok: false as const, error: "Not authorized", status: 403 };
  }

  try {
    if (!(file instanceof File)) {
      throw new AudioUploadError("Please choose an audio file to upload.");
    }

    const safeMediaName = getSafeMediaBaseName(mediaName);
    const normalizedAudio = await normalizeUploadedAudio(file);
    const objectPath = `${workspaceId}/${safeMediaName}.${normalizedAudio.extension}`;

    await putMediaObject("workspaceAudio", objectPath, normalizedAudio.buffer, {
      cacheControl: "60",
      upsert: false,
      contentType: normalizedAudio.contentType,
    });

    // Derived, best-effort WAV sidecar for IVR playback. Failure here
    // must not fail the upload; the MP3 is the canonical object.
    await writeIvrWavSidecar(
      workspaceId,
      `${safeMediaName}.${normalizedAudio.extension}`,
      normalizedAudio.buffer,
    );

    const signedUrl = await getSignedMediaUrl(
      "workspaceAudio",
      objectPath,
      SIGNED_URL_TTL_SECONDS,
    );

    return {
      ok: true as const,
      audio: {
        name: `${safeMediaName}.${normalizedAudio.extension}`,
        path: objectPath,
        signed_url: signedUrl,
      },
    };
  } catch (error) {
    logger.error("uploadWorkspaceAudioApi failed", error);
    // ObjectExistsError's message embeds the workspace id and storage key, so
    // it must never reach a user. A name collision is a normal thing to hit.
    if (error instanceof ObjectExistsError) {
      return {
        ok: false as const,
        error: "An audio file with that name already exists. Choose a different name.",
        status: 409,
      };
    }
    const message =
      error instanceof Error ? error.message : "Failed to upload audio.";
    const status = error instanceof AudioUploadError ? error.status : 500;
    return { ok: false as const, error: message, status };
  }
}
