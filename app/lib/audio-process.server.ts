import * as Cause from "effect-runtime/Cause";
import * as Effect from "effect-runtime/Effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
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

type AudioProcessArgs = {
  command: string;
  messages: AudioProcessMessages;
  /** A seekable output lets MP3 encoders retain delay and padding metadata. */
  stageOutput?: { prefix: string };
  signal?: AbortSignal;
} & ({
  buildArgs: (inputTarget: string, outputTarget: string) => string[];
  inputBuffer: Buffer;
  stage?: { prefix: string };
  inputBuffers?: never;
} | {
  buildArgs: (inputTargets: readonly string[], outputTarget: string) => string[];
  inputBuffers: readonly Buffer[];
  stage: { prefix: string };
  inputBuffer?: never;
});

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

function scopedAudioPath(prefix: string) {
  const filePath = path.join(os.tmpdir(), `${prefix}-${randomUUID()}.${NORMALIZED_AUDIO_EXTENSION}`);
  // Register before writing: even a partial input/output must be removed.
  return Effect.acquireRelease(Effect.succeed(filePath), () =>
    Effect.promise(() => rm(filePath, { force: true }).catch(() => {})),
  );
}

function stageAudioInput(buffer: Buffer, prefix: string, messages: AudioProcessMessages) {
  return Effect.gen(function* () {
    const filePath = yield* scopedAudioPath(prefix);
    yield* Effect.tryPromise({
      try: () => writeFile(filePath, buffer),
      catch: (error) => new AudioUploadError(`${messages.failed}: ${errorMessage(error)}`, 500),
    });
    return filePath;
  });
}

/** All staged inputs, optional seekable output and child share one scope. */
export async function runAudioProcess(args: AudioProcessArgs): Promise<Buffer> {
  const program = Effect.gen(function* () {
    const outputTarget = args.stageOutput ? yield* scopedAudioPath(args.stageOutput.prefix) : "pipe:1";
    let commandArgs: string[];
    let stdinBytes: Buffer;
    if (args.inputBuffers) {
      const targets: string[] = [];
      for (const buffer of args.inputBuffers) targets.push(yield* stageAudioInput(buffer, args.stage.prefix, args.messages));
      commandArgs = args.buildArgs(targets, outputTarget);
      stdinBytes = Buffer.alloc(0);
    } else {
      const inputTarget = args.stage ? yield* stageAudioInput(args.inputBuffer, args.stage.prefix, args.messages) : "pipe:0";
      commandArgs = args.buildArgs(inputTarget, outputTarget);
      stdinBytes = args.stage ? Buffer.alloc(0) : args.inputBuffer;
    }
    const child = yield* Effect.acquireRelease(
      Effect.sync(() => spawn(args.command, commandArgs)),
      (running) =>
        Effect.sync(() => {
          if (typeof running.kill === "function" && !running.killed) {
            running.kill("SIGKILL");
          }
        }),
    );
    const stdout = yield* collectChildOutput(child, stdinBytes, args.messages);
    if (!args.stageOutput) return stdout;
    return yield* Effect.tryPromise({
      try: () => readFile(outputTarget),
      catch: (error) => new AudioUploadError(`${args.messages.failed}: ${errorMessage(error)}`, 500),
    });
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
