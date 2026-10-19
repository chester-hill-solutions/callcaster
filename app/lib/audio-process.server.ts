import * as Cause from "effect-runtime/Cause";
import * as Effect from "effect-runtime/Effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AudioUploadError, NORMALIZED_AUDIO_EXTENSION } from "@/lib/audio-upload";

/**
 * Wedge guard, not a performance budget. A legitimate large conversion must
 * finish inside this window, so keep it generous: this only stops an ffmpeg
 * that never exits from holding the request open forever.
 */
export const AUDIO_PROCESS_TIMEOUT_MS = 10 * 60_000;

export type AudioProcessMessages = { unavailable: string; failed: string };

function chunkToBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function collectChildOutput(
  child: ChildProcessWithoutNullStreams,
  stdinBytes: Buffer,
  messages: AudioProcessMessages,
): Effect.Effect<Buffer, AudioUploadError> {
  return Effect.callback<Buffer, AudioUploadError>((resume) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunkToBuffer(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunkToBuffer(chunk)));

    child.once("error", (error) => {
      resume(
        Effect.fail(
          new AudioUploadError(`${messages.unavailable}: ${errorMessage(error)}`, 500),
        ),
      );
    });

    child.once("close", (code) => {
      if (code === 0) {
        resume(Effect.succeed(Buffer.concat(stdoutChunks)));
        return;
      }
      const details = Buffer.concat(stderrChunks).toString("utf8").trim();
      resume(
        Effect.fail(
          new AudioUploadError(
            details ? `${messages.failed}: ${details}` : `${messages.failed}.`,
            500,
          ),
        ),
      );
    });

    child.stdin.once("error", () => {
      // Ignore EPIPE here; the process exit code captures the real failure.
    });
    child.stdin.end(stdinBytes);
  });
}

/**
 * Run one ffmpeg-family conversion inside a single scope.
 *
 * The scope owns the staged input file (when `stage` is set) and the child
 * process. Both are released on every exit path, so an interruption or the
 * deadline kills the child and removes the file. `buildArgs` receives the input
 * target: a staged file path, or `pipe:0` when nothing is staged.
 */
export async function runAudioProcess(args: {
  command: string;
  buildArgs: (inputTarget: string) => string[];
  inputBuffer: Buffer;
  messages: AudioProcessMessages;
  /** Stage `inputBuffer` to a temp file whose name starts with `prefix`. */
  stage?: { prefix: string };
  /** Cancel the conversion; the scope then kills the child and removes the file. */
  signal?: AbortSignal;
}): Promise<Buffer> {
  const program = Effect.gen(function* () {
    let inputTarget = "pipe:0";
    if (args.stage) {
      const filePath = path.join(
        os.tmpdir(),
        `${args.stage.prefix}-${randomUUID()}.${NORMALIZED_AUDIO_EXTENSION}`,
      );
      // Register the path before writing, so a partial write still removes it.
      yield* Effect.acquireRelease(Effect.succeed(filePath), () =>
        Effect.promise(() => rm(filePath, { force: true }).catch(() => {})),
      );
      yield* Effect.tryPromise({
        try: () => writeFile(filePath, args.inputBuffer),
        catch: (error) =>
          new AudioUploadError(`${args.messages.failed}: ${errorMessage(error)}`, 500),
      });
      inputTarget = filePath;
    }

    const stdinBytes = args.stage ? Buffer.alloc(0) : args.inputBuffer;
    const child = yield* Effect.acquireRelease(
      Effect.sync(() => spawn(args.command, args.buildArgs(inputTarget))),
      (running) =>
        Effect.sync(() => {
          if (typeof running.kill === "function" && !running.killed) {
            running.kill("SIGKILL");
          }
        }),
    );
    return yield* collectChildOutput(child, stdinBytes, args.messages);
  });

  return Effect.runPromise(
    program.pipe(
      Effect.scoped,
      Effect.timeout(AUDIO_PROCESS_TIMEOUT_MS),
      Effect.catchIf(Cause.isTimeoutError, () =>
        Effect.fail(new AudioUploadError(`${args.messages.failed} (timed out).`, 500)),
      ),
    ),
    args.signal ? { signal: args.signal } : undefined,
  );
}
