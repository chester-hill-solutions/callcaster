import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  AudioUploadError,
  MIN_CLIP_DURATION_MS,
  NORMALIZED_AUDIO_CONTENT_TYPE,
  NORMALIZED_AUDIO_EXTENSION,
  isAllowedAudioExtension,
} from "@/lib/audio-upload";

export {
  AudioUploadError,
  MIN_CLIP_DURATION_MS,
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

type TrimAudioBufferDeps = Partial<{
  runAudioTool: typeof runAudioTool;
}>;

type ProbeAudioDurationDeps = Partial<{
  runAudioTool: typeof runAudioTool;
}>;

/** Encoder flags shared by normalization and trimming so every object in the
 * workspaceAudio bucket is the same mono 44.1kHz MP3, whatever produced it. */
const MP3_ENCODE_ARGS = [
  "-vn",
  "-acodec",
  "libmp3lame",
  "-ac",
  "1",
  "-ar",
  "44100",
  "-f",
  "mp3",
];

function formatSeconds(milliseconds: number) {
  return (milliseconds / 1000).toFixed(3);
}

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

/**
 * Spawn an ffmpeg-family binary, write `inputBuffer` to stdin, and collect
 * stdout. `unavailableMessage`/`failedMessage` shape the AudioUploadError so
 * each caller can speak in its own terms.
 */
export async function runAudioTool(
  command: string,
  args: string[],
  inputBuffer: Buffer,
  messages: { unavailable: string; failed: string },
) {
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.once("error", (error) => {
      reject(new AudioUploadError(`${messages.unavailable}: ${error.message}`, 500));
    });

    child.once("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }

      const details = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(
        new AudioUploadError(
          details ? `${messages.failed}: ${details}` : `${messages.failed}.`,
          500,
        ),
      );
    });

    child.stdin.once("error", () => {
      // Ignore EPIPE here; the process exit code captures the real failure.
    });
    child.stdin.end(inputBuffer);
  });
}

export async function transcodeAudioBuffer(inputBuffer: Buffer) {
  return await runAudioTool(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", ...MP3_ENCODE_ARGS, "pipe:1"],
    inputBuffer,
    {
      unavailable: "Audio transcoding is unavailable",
      failed: "Audio transcoding failed",
    },
  );
}

/**
 * Render the `[startMs, endMs)` slice of `inputBuffer` as a new MP3.
 *
 * Seeking is placed after `-i` on purpose: stdin is not seekable, so
 * input-side `-ss` would decode-and-discard anyway, and output-side seeking is
 * sample-accurate. `-t` (duration) rather than `-to` keeps the window relative
 * to the seek point regardless of ffmpeg version.
 */
export async function trimAudioBuffer(
  inputBuffer: Buffer,
  range: { startMs: number; endMs: number },
  deps: TrimAudioBufferDeps = {},
) {
  const d = { runAudioTool, ...deps };
  const { startMs, endMs } = range;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new AudioUploadError("Clip start and end must be numbers.");
  }
  if (startMs < 0) {
    throw new AudioUploadError("Clip start cannot be negative.");
  }
  if (endMs <= startMs) {
    throw new AudioUploadError("Clip end must be after clip start.");
  }
  if (endMs - startMs < MIN_CLIP_DURATION_MS) {
    throw new AudioUploadError(
      `Clips must be at least ${MIN_CLIP_DURATION_MS}ms long.`,
    );
  }

  const outputBuffer = await d.runAudioTool(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ss",
      formatSeconds(startMs),
      "-t",
      formatSeconds(endMs - startMs),
      ...MP3_ENCODE_ARGS,
      "pipe:1",
    ],
    inputBuffer,
    {
      unavailable: "Audio trimming is unavailable",
      failed: "Audio trimming failed",
    },
  );

  if (outputBuffer.length === 0) {
    throw new AudioUploadError("Audio trimming produced an empty clip.", 500);
  }

  return {
    buffer: outputBuffer,
    contentType: NORMALIZED_AUDIO_CONTENT_TYPE,
    extension: NORMALIZED_AUDIO_EXTENSION,
  };
}

/**
 * Duration in whole milliseconds via ffprobe, or null when no duration can be
 * read. Callers treat null as "unknown", never as zero.
 *
 * The buffer is staged to a temp file rather than piped: MP3 carries no
 * duration in its header, so ffprobe has to seek the stream to measure it and
 * reports `N/A` for every non-seekable pipe input.
 */
export async function probeAudioDurationMs(
  inputBuffer: Buffer,
  deps: ProbeAudioDurationDeps = {},
) {
  const d = { runAudioTool, ...deps };

  const filePath = path.join(
    os.tmpdir(),
    `callcaster-probe-${randomUUID()}.${NORMALIZED_AUDIO_EXTENSION}`,
  );

  try {
    await writeFile(filePath, inputBuffer);

    const output = await d.runAudioTool(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      Buffer.alloc(0),
      {
        unavailable: "Audio inspection is unavailable",
        failed: "Audio inspection failed",
      },
    );

    const seconds = Number.parseFloat(output.toString("utf8").trim());
    if (!Number.isFinite(seconds) || seconds < 0) {
      return null;
    }

    return Math.round(seconds * 1000);
  } finally {
    await rm(filePath, { force: true }).catch(() => {
      // Best effort: a stranded temp file must not fail the upload.
    });
  }
}
