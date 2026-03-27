/** Client-safe file input `accept` value (no Node / ffmpeg). */
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
