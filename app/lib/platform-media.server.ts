import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AudioUploadError,
  getSafeMediaBaseName,
  normalizeUploadedAudio,
} from "@/lib/audio.server";
import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
import { MemberRole } from "@/lib/member-role";
import { logger } from "@/lib/logger.server";

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
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  filter: (name: string) => boolean,
) {
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId, { sortBy: { column: "created_at", order: "desc" } });

  if (mediaError) {
    logger.warn("listWorkspaceMediaWithUrls error", mediaError);
    return { ok: false as const, error: mediaError.message, status: 500 };
  }

  const filtered = (mediaData ?? []).filter((item) => filter(item.name));
  if (filtered.length === 0) {
    return { ok: true as const, audios: [] };
  }

  const mediaPaths = filtered.map((media) => `${workspaceId}/${media.name}`);
  const { data: signedUrls, error: signedUrlsError } = await supabaseClient.storage
    .from("workspaceAudio")
    .createSignedUrls(mediaPaths, SIGNED_URL_TTL_SECONDS);

  if (signedUrlsError) {
    return { ok: false as const, error: signedUrlsError.message, status: 500 };
  }

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
}

export async function listWorkspaceAudiosApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  return listWorkspaceMediaWithUrls(
    supabaseClient,
    workspaceId,
    isWorkspaceAudioFile,
  );
}

export async function listWorkspaceVoicemailsApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  return listWorkspaceMediaWithUrls(
    supabaseClient,
    workspaceId,
    isVoicemailFile,
  );
}

export async function uploadWorkspaceAudioApi(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  mediaName: string,
  file: File,
) {
  const role = await getUserRole({
    supabaseClient,
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

    const { error: uploadError } = await supabaseClient.storage
      .from("workspaceAudio")
      .upload(objectPath, normalizedAudio.buffer, {
        cacheControl: "60",
        upsert: false,
        contentType: normalizedAudio.contentType,
      });

    if (uploadError) {
      return { ok: false as const, error: uploadError.message, status: 400 };
    }

    const { data: signed } = await supabaseClient.storage
      .from("workspaceAudio")
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

    return {
      ok: true as const,
      audio: {
        name: `${safeMediaName}.${normalizedAudio.extension}`,
        path: objectPath,
        signed_url: signed?.signedUrl ?? null,
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
