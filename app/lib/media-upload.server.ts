import { assertValidAudioUpload } from "@/lib/audio.server";
import { AudioUploadError } from "@/lib/audio-upload";

export const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_BODY_BYTES = MAX_MEDIA_FILE_BYTES + 64 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/flac",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "mp3",
  "wav",
  "ogg",
  "aac",
  "m4a",
  "mp4",
  "flac",
]);

export function sanitizeFilename(filename: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(filename);
  } catch {
    return null;
  }
  const sanitized = decoded
    // eslint-disable-next-line no-control-regex -- strip control chars from user-supplied filenames
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9-_.]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const parts = sanitized.split(".");
  const ext = parts.pop()?.toLowerCase();
  const name = parts.join("_").replace(/\.+$/g, "");
  if (!ext || !name) {
    return null;
  }
  return `${name}.${ext}`;
}

export function validateMediaFile(
  file: unknown,
  kind: "audio" | "message" = "message",
):
  | { ok: false; error: string; status: 400 | 413 }
  | { ok: true; safeName: string; file: File } {
  if (!(file instanceof File)) {
    return { ok: false, status: 400, error: "Invalid file upload" };
  }
  if (file.size > MAX_MEDIA_FILE_BYTES) {
    return { ok: false, status: 413, error: "File exceeds 10MB limit" };
  }
  const fileName = file.name;
  const safeName = sanitizeFilename(fileName);
  if (!safeName) {
    return { ok: false, status: 400, error: "Invalid filename" };
  }
  if (kind === "audio") {
    try {
      assertValidAudioUpload(file);
    } catch (error) {
      if (error instanceof AudioUploadError)
        return { ok: false, status: 400, error: error.message };
      throw error;
    }
    return { ok: true, safeName, file };
  }
  const ext = safeName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, status: 400, error: "Invalid file extension" };
  }
  const type = file.type || "";
  if (
    type &&
    type !== "application/octet-stream" &&
    !ALLOWED_MEDIA_TYPES.has(type)
  ) {
    return { ok: false, status: 400, error: "Invalid file type" };
  }
  return { ok: true, safeName, file };
}
