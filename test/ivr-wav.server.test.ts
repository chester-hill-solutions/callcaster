import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  putMediaObject: vi.fn(),
  transcodeToWavBuffer: vi.fn(),
  objectExists: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/adapters/media-library.adapter.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/adapters/media-library.adapter.server")>()),
  putMediaObject: (...a: unknown[]) => mocks.putMediaObject(...a),
}));

vi.mock("@/lib/audio.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audio.server")>()),
  transcodeToWavBuffer: (...a: unknown[]) => mocks.transcodeToWavBuffer(...a),
}));

vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  objectExists: (...a: unknown[]) => mocks.objectExists(...a),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger.server")>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: (...a: unknown[]) => mocks.loggerError(...a),
    },
  };
});

import {
  isWavFileName,
  ivrWavObjectKey,
  resolveIvrPromptObjectKey,
  writeIvrWavSidecar,
} from "@/lib/ivr-wav.server";

describe("ivrWavObjectKey", () => {
  test("maps a library file to its sidecar key, extension stripped", () => {
    expect(ivrWavObjectKey("ws-1", "Intro.mp3")).toBe("ivr-wav/ws-1/Intro.wav");
    expect(ivrWavObjectKey("ws-1", "hold.m4a")).toBe("ivr-wav/ws-1/hold.wav");
  });

  test("a name with no known extension still gets a .wav key", () => {
    expect(ivrWavObjectKey("ws-1", "noext")).toBe("ivr-wav/ws-1/noext.wav");
  });

  test("isWavFileName is case-insensitive", () => {
    expect(isWavFileName("a.wav")).toBe(true);
    expect(isWavFileName("A.WAV")).toBe(true);
    expect(isWavFileName("a.mp3")).toBe(false);
  });
});

describe("writeIvrWavSidecar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transcodeToWavBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));
    mocks.putMediaObject.mockResolvedValue(undefined);
  });

  test("transcodes the MP3 and stores the sidecar with upsert", async () => {
    await writeIvrWavSidecar("ws-1", "Intro.mp3", Buffer.from([9]));

    expect(mocks.transcodeToWavBuffer).toHaveBeenCalledWith(Buffer.from([9]));
    expect(mocks.putMediaObject).toHaveBeenCalledWith(
      "workspaceAudio",
      "ivr-wav/ws-1/Intro.wav",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "audio/wav", upsert: true }),
    );
  });

  test("does nothing when the file is already a wav", async () => {
    await writeIvrWavSidecar("ws-1", "Intro.wav", Buffer.from([9]));
    expect(mocks.transcodeToWavBuffer).not.toHaveBeenCalled();
    expect(mocks.putMediaObject).not.toHaveBeenCalled();
  });

  test("an empty transcode result is not stored", async () => {
    mocks.transcodeToWavBuffer.mockResolvedValue(Buffer.alloc(0));
    await writeIvrWavSidecar("ws-1", "Intro.mp3", Buffer.from([9]));
    expect(mocks.putMediaObject).not.toHaveBeenCalled();
  });

  test("a transcode failure is swallowed (the MP3 remains canonical)", async () => {
    mocks.transcodeToWavBuffer.mockRejectedValue(new Error("ffmpeg missing"));
    await expect(
      writeIvrWavSidecar("ws-1", "Intro.mp3", Buffer.from([9])),
    ).resolves.toBeUndefined();
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe("resolveIvrPromptObjectKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("prefers the WAV sidecar when it exists", async () => {
    mocks.objectExists.mockResolvedValue(true);
    await expect(resolveIvrPromptObjectKey("ws-1", "Intro.mp3")).resolves.toBe(
      "ivr-wav/ws-1/Intro.wav",
    );
  });

  test("falls back to the stored file when the sidecar is absent", async () => {
    mocks.objectExists.mockResolvedValue(false);
    await expect(resolveIvrPromptObjectKey("ws-1", "Intro.mp3")).resolves.toBe(
      "ws-1/Intro.mp3",
    );
  });

  test("a wav file is used as-is without a lookup", async () => {
    await expect(resolveIvrPromptObjectKey("ws-1", "Intro.wav")).resolves.toBe(
      "ws-1/Intro.wav",
    );
    expect(mocks.objectExists).not.toHaveBeenCalled();
  });

  test("a lookup failure falls back rather than failing the call", async () => {
    mocks.objectExists.mockRejectedValue(new Error("storage down"));
    await expect(resolveIvrPromptObjectKey("ws-1", "Intro.mp3")).resolves.toBe(
      "ws-1/Intro.mp3",
    );
  });
});
