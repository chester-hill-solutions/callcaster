const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".oga",
  ".ogg",
  ".wav",
  ".webm",
]);

export const NORMALIZED_AUDIO_CONTENT_TYPE = "audio/mpeg";
export const NORMALIZED_AUDIO_EXTENSION = "mp3";

/** Shortest clip the editor will render. Shared so the client can block the
 * save before a round trip and the server can still reject a crafted request. */
export const MIN_CLIP_DURATION_MS = 100;

export class AudioUploadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AudioUploadError";
    this.status = status;
  }
}

export function getAudioUploadAcceptValue() {
  return [
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".ogg",
    ".wav",
    ".webm",
    "audio/*",
  ].join(",");
}

export function getSafeMediaBaseName(mediaName: string) {
  const trimmed = mediaName.trim();
  if (trimmed.length === 0) {
    throw new AudioUploadError("Audio name is required.");
  }

  let baseName = trimmed;
  let stripped = true;
  while (stripped) {
    stripped = false;
    const extensionMatch = baseName.match(/\.[^.]+$/);
    const extension = extensionMatch?.[0]?.toLowerCase() ?? "";
    if (extension.length === 0 || !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
      continue;
    }

    baseName = baseName.slice(0, -extension.length).trim();
    if (baseName.length === 0) {
      break;
    }
    stripped = true;
  }

  if (baseName.length === 0) {
    throw new AudioUploadError("Audio name is required.");
  }

  return baseName;
}

export function isAllowedAudioExtension(extension: string) {
  return ALLOWED_AUDIO_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Pick a base name that is not already taken, suffixing `-2`, `-3`, ... .
 *
 * Uploads go through a bare S3 PutObject, which overwrites silently. Since a
 * filename is also how campaigns and IVR steps point at audio, an overwrite
 * doesn't just lose a file — it changes what live callers hear. Callers that
 * mean to replace a file must say so explicitly; everything else routes
 * through here.
 *
 * `taken` holds base names without extension, compared case-insensitively
 * because S3 keys are case-sensitive but users do not expect "Intro" and
 * "intro" to be different recordings.
 */
export function resolveAvailableBaseName(
  desiredBaseName: string,
  taken: Iterable<string>,
) {
  const takenLower = new Set(
    [...taken].map((name) => name.trim().toLowerCase()),
  );

  if (!takenLower.has(desiredBaseName.toLowerCase())) {
    return desiredBaseName;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${desiredBaseName}-${suffix}`;
    if (!takenLower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}
