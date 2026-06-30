import {
  AudioUploadError,
  getSafeMediaBaseName,
  normalizeUploadedAudio,
} from "@/lib/audio.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import type { Database } from "@/lib/db-types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";
import {
  createSignedObjectUrl,
  createSignedObjectUrls,
  listObjects,
  uploadObject,
} from "@/lib/object-storage.server";

const SIGNED_URL_TTL_SECONDS = 3600;

function isVoicemailFile(name: string): boolean {
  return name.includes("voicemail-+") || name.includes("voicemail-undefined");
}

function isWorkspaceAudioFile(name: string): boolean {
  return (
    !isVoicemailFile(name) &&
    !name.includes("recording-")
  );
}

async function listWorkspaceMediaWithUrls(
  workspaceId: string,
  filter: (name: string) => boolean,
) {
  try {
    const mediaData = await listObjects("workspaceAudio", workspaceId, {
      sortBy: { column: "created_at", order: "desc" },
    });

    const filtered = mediaData.filter((item) => filter(item.name));
    if (filtered.length === 0) {
      return { ok: true as const, audios: [] };
    }

    const mediaPaths = filtered.map((media) => `${workspaceId}/${media.name}`);
    const signedUrls = await createSignedObjectUrls(
      "workspaceAudio",
      mediaPaths,
      SIGNED_URL_TTL_SECONDS,
    );

    const audios = filtered.map((media) => {
      const signedUrl = signedUrls.find(
        (entry) => entry.path === `${workspaceId}/${media.name}`,
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

  return listWorkspaceMediaWithUrls(workspaceId, isWorkspaceAudioFile);
}

export async function listWorkspaceVoicemailsApi(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  return listWorkspaceMediaWithUrls(workspaceId, isVoicemailFile);
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

    await uploadObject("workspaceAudio", objectPath, normalizedAudio.buffer, {
      cacheControl: "60",
      upsert: false,
      contentType: normalizedAudio.contentType,
    });

    const signedUrl = await createSignedObjectUrl(
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
    const message =
      error instanceof Error ? error.message : "Failed to upload audio.";
    const status = error instanceof AudioUploadError ? error.status : 500;
    return { ok: false as const, error: message, status };
  }
}
