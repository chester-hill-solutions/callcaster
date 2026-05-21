import path from "node:path";
import { spawn } from "node:child_process";
import {
  AudioUploadError,
  NORMALIZED_AUDIO_CONTENT_TYPE,
  NORMALIZED_AUDIO_EXTENSION,
  getSafeMediaBaseName,
  isAllowedAudioExtension,
} from "@/lib/audio-upload";

export {
  AudioUploadError,
  NORMALIZED_AUDIO_CONTENT_TYPE,
  NORMALIZED_AUDIO_EXTENSION,
  getAudioUploadAcceptValue,
  getSafeMediaBaseName,
} from "@/lib/audio-upload";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "application/octet-stream",
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-aac",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-wav",
  "audio/wave",
  "video/mp4",
]);

type NormalizeUploadedAudioDeps = Partial<{
  transcodeAudioBuffer: typeof transcodeAudioBuffer;
}>;

export function assertValidAudioUpload(file: File) {
  if (!(file instanceof File)) {
    throw new AudioUploadError("Please choose an audio file to upload.");
  }

  if (file.size <= 0) {
    throw new AudioUploadError("Uploaded audio file is empty.");
  }

  const extension = path.extname(file.name).toLowerCase();
  const normalizedType = file.type.toLowerCase();
  const typeAllowed =
    normalizedType.length === 0 ||
    ALLOWED_AUDIO_MIME_TYPES.has(normalizedType) ||
    normalizedType.startsWith("audio/");

  if (!isAllowedAudioExtension(extension) || !typeAllowed) {
    throw new AudioUploadError(
      "Unsupported audio format. Please upload MP3, WAV, M4A, OGG, AAC, FLAC, or WebM audio.",
    );
  }
}

export async function normalizeUploadedAudio(
  file: File,
  deps: NormalizeUploadedAudioDeps = {},
) {
  assertValidAudioUpload(file);

  const d = {
    transcodeAudioBuffer,
    ...deps,
  };

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const outputBuffer = await d.transcodeAudioBuffer(inputBuffer);

  if (outputBuffer.length === 0) {
    throw new AudioUploadError("Audio transcoding failed to produce output.", 500);
  }

  return {
    buffer: outputBuffer,
    contentType: NORMALIZED_AUDIO_CONTENT_TYPE,
    extension: NORMALIZED_AUDIO_EXTENSION,
  };
}

export async function transcodeAudioBuffer(inputBuffer: Buffer) {
  return await new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-f",
      "mp3",
      "pipe:1",
    ]);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    ffmpeg.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    ffmpeg.once("error", (error) => {
      reject(
        new AudioUploadError(
          `Audio transcoding is unavailable: ${error.message}`,
          500,
        ),
      );
    });

    ffmpeg.once("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      const details = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(
        new AudioUploadError(
          details
            ? `Audio transcoding failed: ${details}`
            : "Audio transcoding failed.",
          500,
        ),
      );
    });

    ffmpeg.stdin.once("error", () => {
      // Ignore EPIPE here; the process exit code captures the real failure.
    });
    ffmpeg.stdin.end(inputBuffer);
  });
}
