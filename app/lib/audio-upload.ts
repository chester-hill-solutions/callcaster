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
