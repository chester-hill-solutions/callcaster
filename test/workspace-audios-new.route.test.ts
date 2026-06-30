import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
const mocks = vi.hoisted(() => {
  class AudioUploadError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.name = "AudioUploadError";
      this.status = status;
    }
  }

  return {
    AudioUploadError,
    getSafeMediaBaseName: vi.fn((name: string) =>
      name.trim().replace(/\.[^.]+$/, ""),
    ),
    normalizeUploadedAudio: vi.fn(),
    verifyAuth: vi.fn(),
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("@/lib/audio.server", () => ({
  AudioUploadError: mocks.AudioUploadError,
  getAudioUploadAcceptValue: () => "audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.webm",
  getSafeMediaBaseName: (...args: unknown[]) => mocks.getSafeMediaBaseName(...args),
  normalizeUploadedAudio: (...args: unknown[]) => mocks.normalizeUploadedAudio(...args),
}));
vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeDbClient(opts?: { uploadError?: unknown }) {
  const upload = vi.fn(async () => ({
    data: opts?.uploadError ? null : { path: "workspaceAudio/w1/greeting.mp3" },
    error: opts?.uploadError ?? null,
  }));

  return {
    upload,
    client: {
      storage: {
        from: () => ({
          upload,
        }),
      },
    },
  };
}

describe("app/routes/workspaces++_.$id.audios_.new.tsx action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSafeMediaBaseName.mockClear();
    mocks.normalizeUploadedAudio.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
  });

  test("normalizes the upload before storing a canonical mp3", async () => {
    const client = makeDbClient();
    mocks.verifyAuth.mockResolvedValueOnce({
      null: adminDb.client,
      headers: new Headers(),
    });
    mocks.normalizeUploadedAudio.mockResolvedValueOnce({
      buffer: Buffer.from("normalized-audio"),
      contentType: "audio/mpeg",
      extension: "mp3",
    });

    const mod = await import("../app/routes/workspaces+/$id/audios/new.route");
    const formData = new FormData();
    formData.set("media-name", " Greeting ");
    formData.set(
      "media",
      new File(["source-audio"], "greeting.m4a", { type: "audio/mp4" }),
    );

    const response = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/workspaces/w1/audios/new", {
        method: "POST",
        body: formData,
      }),
      params: { id: "w1" },
    } as any));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("../audios?uploaded=1");
    expect(mocks.normalizeUploadedAudio).toHaveBeenCalledTimes(1);
    expect(mocks.getSafeMediaBaseName).toHaveBeenCalledWith(" Greeting ");
    expect(adminDb.upload).toHaveBeenCalledWith(
      "w1/Greeting.mp3",
      Buffer.from("normalized-audio"),
      {
        cacheControl: "60",
        upsert: false,
        contentType: "audio/mpeg",
      },
    );
  });

  test("returns a validation error when no file is provided", async () => {
    const client = makeDbClient();
    mocks.verifyAuth.mockResolvedValueOnce({
      null: adminDb.client,
      headers: new Headers(),
    });

    const mod = await import("../app/routes/workspaces+/$id/audios/new.route");
    const formData = new FormData();
    formData.set("media-name", "Greeting");

    const response = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/workspaces/w1/audios/new", {
        method: "POST",
        body: formData,
      }),
      params: { id: "w1" },
    } as any));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Please choose an audio file to upload.",
    });
    expect(mocks.normalizeUploadedAudio).not.toHaveBeenCalled();
    expect(adminDb.upload).not.toHaveBeenCalled();
  });

  test("returns helper failures without uploading invalid audio", async () => {
    const client = makeDbClient();
    mocks.verifyAuth.mockResolvedValueOnce({
      null: adminDb.client,
      headers: new Headers(),
    });
    mocks.normalizeUploadedAudio.mockRejectedValueOnce(
      new mocks.AudioUploadError("Unsupported audio format.", 400),
    );

    const mod = await import("../app/routes/workspaces+/$id/audios/new.route");
    const formData = new FormData();
    formData.set("media-name", "Greeting");
    formData.set(
      "media",
      new File(["bogus"], "bad.ogg", { type: "audio/ogg" }),
    );

    const response = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/workspaces/w1/audios/new", {
        method: "POST",
        body: formData,
      }),
      params: { id: "w1" },
    } as any));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Unsupported audio format.",
    });
    expect(mocks.logger.error).toHaveBeenCalled();
    expect(adminDb.upload).not.toHaveBeenCalled();
  });
});
