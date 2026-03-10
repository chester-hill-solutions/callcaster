import { beforeEach, describe, expect, test, vi } from "vitest";

describe("app/lib/audio.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
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
            throw new mod.AudioUploadError("Audio transcoding failed: decoder exploded", 500);
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
    expect(() => mod.getSafeMediaBaseName("   ")).toThrow(mod.AudioUploadError);
  });
});
