import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, test, vi } from "vitest";

function createSpawnMock() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });

  return proc;
}

describe("app/lib/audio.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test("returns upload accept value", async () => {
    const mod = await import("../app/lib/audio.server");
    expect(mod.getAudioUploadAcceptValue()).toBe(
      ".aac,.flac,.m4a,.mp3,.ogg,.wav,.webm,audio/*",
    );
  });

  test("normalizes accepted uploads to canonical mp3 output", async () => {
    const mod = await import("../app/lib/audio.server");
    const transcodeAudioBuffer = vi.fn(async (input: Buffer) => {
      expect(input).toEqual(Buffer.from("fake-m4a"));
      return Buffer.from("normalized-mp3");
    });

    await expect(
      mod.normalizeUploadedAudio(
        new File(["fake-m4a"], "greeting.m4a", { type: "audio/mp4" }),
        { transcodeAudioBuffer },
      ),
    ).resolves.toEqual({
      buffer: Buffer.from("normalized-mp3"),
      contentType: "audio/mpeg",
      extension: "mp3",
    });
    expect(transcodeAudioBuffer).toHaveBeenCalledTimes(1);
  });

  test("normalizes with default deps when ffmpeg succeeds", async () => {
    const proc = createSpawnMock();
    proc.stdin.end = vi.fn(() => {
      proc.stdout.emit("data", Buffer.from("normalized-default"));
      proc.emit("close", 0);
    });
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.normalizeUploadedAudio(
        new File(["wav"], "voice.wav", { type: "audio/wav" }),
      ),
    ).resolves.toEqual({
      buffer: Buffer.from("normalized-default"),
      contentType: "audio/mpeg",
      extension: "mp3",
    });
  });

  test("validates uploads for empty files, extensions, and mime types", async () => {
    const mod = await import("../app/lib/audio.server");

    expect(() => mod.assertValidAudioUpload({} as File)).toThrow(
      "Please choose an audio file to upload.",
    );
    expect(() =>
      mod.assertValidAudioUpload(
        new File([], "empty.mp3", { type: "audio/mpeg" }),
      ),
    ).toThrow("Uploaded audio file is empty.");
    expect(() =>
      mod.assertValidAudioUpload(new File(["x"], "voice.mp3", { type: "" })),
    ).not.toThrow();
    expect(() =>
      mod.assertValidAudioUpload(
        new File(["x"], "voice.webm", { type: "audio/custom" }),
      ),
    ).not.toThrow();
    expect(() =>
      mod.assertValidAudioUpload(
        new File(["x"], "voice.txt", { type: "audio/mpeg" }),
      ),
    ).toThrow(
      "Unsupported audio format. Please upload MP3, WAV, M4A, OGG, AAC, FLAC, or WebM audio.",
    );
    expect(() =>
      mod.assertValidAudioUpload(
        new File(["x"], "voice.wav", { type: "text/plain" }),
      ),
    ).toThrow(
      "Unsupported audio format. Please upload MP3, WAV, M4A, OGG, AAC, FLAC, or WebM audio.",
    );
  });

  test("rejects unsupported uploads before calling the transcoder", async () => {
    const mod = await import("../app/lib/audio.server");
    const transcodeAudioBuffer = vi.fn();

    await expect(
      mod.normalizeUploadedAudio(
        new File(["not-audio"], "notes.txt", { type: "text/plain" }),
        { transcodeAudioBuffer },
      ),
    ).rejects.toMatchObject({
      message:
        "Unsupported audio format. Please upload MP3, WAV, M4A, OGG, AAC, FLAC, or WebM audio.",
      status: 400,
    });
    expect(transcodeAudioBuffer).not.toHaveBeenCalled();
  });

  test("surfaces transcoder failures", async () => {
    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.normalizeUploadedAudio(
        new File(["bad-wav"], "broken.wav", { type: "audio/wav" }),
        {
          transcodeAudioBuffer: vi.fn(async () => {
            throw new mod.AudioUploadError(
              "Audio transcoding failed: decoder exploded",
              500,
            );
          }),
        },
      ),
    ).rejects.toMatchObject({
      message: "Audio transcoding failed: decoder exploded",
      status: 500,
    });
  });

  test("fails when the transcoder returns an empty output", async () => {
    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.normalizeUploadedAudio(
        new File(["good-wav"], "hello.wav", { type: "audio/wav" }),
        { transcodeAudioBuffer: vi.fn(async () => Buffer.alloc(0)) },
      ),
    ).rejects.toMatchObject({
      message: "Audio transcoding failed to produce output.",
      status: 500,
    });
  });

  test("sanitizes provided media names", async () => {
    const mod = await import("../app/lib/audio.server");

    expect(mod.getSafeMediaBaseName(" Greeting.wav ")).toBe("Greeting");
    expect(mod.getSafeMediaBaseName("backup.mp3.wav")).toBe("backup");
    expect(mod.getSafeMediaBaseName("track.mp3")).toBe("track");
    expect(mod.getSafeMediaBaseName("a.wav.wav")).toBe("a");
    expect(() => mod.getSafeMediaBaseName(".wav")).toThrow(
      mod.AudioUploadError,
    );
    expect(() => mod.getSafeMediaBaseName("   ")).toThrow(mod.AudioUploadError);
  });

  test("transcodes buffer on ffmpeg success", async () => {
    const proc = createSpawnMock();
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");
    const pending = mod.transcodeAudioBuffer(Buffer.from("in"));

    proc.stdout.emit("data", "a");
    proc.stdout.emit("data", Buffer.from("b"));
    proc.emit("close", 0);

    await expect(pending).resolves.toEqual(Buffer.from("ab"));
    expect(proc.stdin.end).toHaveBeenCalledWith(Buffer.from("in"));
  });

  test("returns detailed ffmpeg close error when available", async () => {
    const proc = createSpawnMock();
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");
    const pending = mod.transcodeAudioBuffer(Buffer.from("in"));

    proc.stderr.emit("data", "decode failed");
    proc.stderr.emit("data", Buffer.from(" details"));
    proc.emit("close", 1);

    await expect(pending).rejects.toMatchObject({
      message: "Audio transcoding failed: decode failed details",
      status: 500,
    });
  });

  test("returns generic ffmpeg close error when stderr is empty", async () => {
    const proc = createSpawnMock();
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");
    const pending = mod.transcodeAudioBuffer(Buffer.from("in"));

    proc.emit("close", 2);

    await expect(pending).rejects.toMatchObject({
      message: "Audio transcoding failed.",
      status: 500,
    });
  });

  test("returns unavailable error when ffmpeg process emits error", async () => {
    const proc = createSpawnMock();
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");
    const pending = mod.transcodeAudioBuffer(Buffer.from("in"));

    proc.emit("error", new Error("spawn ENOENT"));

    await expect(pending).rejects.toMatchObject({
      message: "Audio transcoding is unavailable: spawn ENOENT",
      status: 500,
    });
  });

  test("ignores stdin EPIPE and still resolves from close code", async () => {
    const proc = createSpawnMock();
    vi.doMock("node:child_process", () => ({ spawn: vi.fn(() => proc) }));

    const mod = await import("../app/lib/audio.server");
    const pending = mod.transcodeAudioBuffer(Buffer.from("in"));

    proc.stdin.emit("error", new Error("EPIPE"));
    proc.stdout.emit("data", Buffer.from("ok"));
    proc.emit("close", 0);

    await expect(pending).resolves.toEqual(Buffer.from("ok"));
  });

  test("trims a range to canonical mp3 output", async () => {
    const mod = await import("../app/lib/audio.server");
    const runAudioTool = vi.fn(async () => Buffer.from("clip-mp3"));

    await expect(
      mod.trimAudioBuffer(Buffer.from("source"), { startMs: 1000, endMs: 3000 }, {
        runAudioTool,
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("clip-mp3"),
      contentType: "audio/mpeg",
      extension: "mp3",
    });

    // Output-side seek (-ss after -i) with a relative -t duration: stdin is not
    // seekable, so input-side -ss would not be sample accurate.
    const args = runAudioTool.mock.calls[0][1] as string[];
    expect(args.indexOf("-ss")).toBeGreaterThan(args.indexOf("pipe:0"));
    expect(args[args.indexOf("-ss") + 1]).toBe("1.000");
    expect(args[args.indexOf("-t") + 1]).toBe("2.000");
    expect(args).not.toContain("-to");
  });

  test("rejects invalid trim ranges before spawning ffmpeg", async () => {
    const mod = await import("../app/lib/audio.server");
    const runAudioTool = vi.fn();
    const source = Buffer.from("source");

    await expect(
      mod.trimAudioBuffer(source, { startMs: 3000, endMs: 1000 }, { runAudioTool }),
    ).rejects.toMatchObject({ message: "Clip end must be after clip start." });

    await expect(
      mod.trimAudioBuffer(source, { startMs: -1, endMs: 1000 }, { runAudioTool }),
    ).rejects.toMatchObject({ message: "Clip start cannot be negative." });

    await expect(
      mod.trimAudioBuffer(source, { startMs: 0, endMs: 50 }, { runAudioTool }),
    ).rejects.toMatchObject({ message: "Clips must be at least 100ms long." });

    await expect(
      mod.trimAudioBuffer(source, { startMs: 0, endMs: Number.NaN }, { runAudioTool }),
    ).rejects.toMatchObject({ message: "Clip start and end must be numbers." });

    expect(runAudioTool).not.toHaveBeenCalled();
  });

  test("fails when trimming produces an empty clip", async () => {
    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.trimAudioBuffer(
        Buffer.from("source"),
        { startMs: 0, endMs: 1000 },
        { runAudioTool: vi.fn(async () => Buffer.alloc(0)) },
      ),
    ).rejects.toMatchObject({
      message: "Audio trimming produced an empty clip.",
      status: 500,
    });
  });

  test("probes duration from a seekable temp file, not a pipe", async () => {
    const mod = await import("../app/lib/audio.server");
    const runAudioTool = vi.fn(async () => Buffer.from("5.042000\n"));

    await expect(
      mod.probeAudioDurationMs(Buffer.from("mp3"), { runAudioTool }),
    ).resolves.toBe(5042);

    // MP3 has no header duration, so ffprobe reports N/A for pipe input.
    const args = runAudioTool.mock.calls[0][1] as string[];
    expect(args).not.toContain("pipe:0");
    expect(args.at(-1)).toMatch(/callcaster-probe-.*\.mp3$/);
  });

  test("returns null when duration is unreadable", async () => {
    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.probeAudioDurationMs(Buffer.from("mp3"), {
        runAudioTool: vi.fn(async () => Buffer.from("N/A\n")),
      }),
    ).resolves.toBeNull();
  });

  test("removes the temp file even when probing fails", async () => {
    const rm = vi.fn(async () => undefined);
    vi.doMock("node:fs/promises", () => ({
      rm,
      writeFile: vi.fn(async () => undefined),
    }));

    const mod = await import("../app/lib/audio.server");

    await expect(
      mod.probeAudioDurationMs(Buffer.from("mp3"), {
        runAudioTool: vi.fn(async () => {
          throw new Error("ffprobe exploded");
        }),
      }),
    ).rejects.toThrow("ffprobe exploded");

    expect(rm).toHaveBeenCalledTimes(1);
  });
});
