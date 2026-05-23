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
});
