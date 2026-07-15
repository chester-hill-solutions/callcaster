import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  uploadObject: vi.fn(async () => undefined),
  loadWorkspaceTwilioCredentials: vi.fn(async () => ({
    sid: "ACsub",
    authToken: "secret",
  })),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: (...args: unknown[]) => mocks.uploadObject(...args),
}));

vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    query: {
      workspace: {
        findFirst: vi.fn(),
      },
    },
  },
}));

describe("call-recording-storage.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue(
      new Response(Buffer.from("audio-bytes"), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    mocks.uploadObject.mockResolvedValue(undefined);
    mocks.loadWorkspaceTwilioCredentials.mockResolvedValue({
      sid: "ACsub",
      authToken: "secret",
    });
  });

  test("callRecordingStoragePath uses workspace and call sid", async () => {
    const { callRecordingStoragePath } = await import(
      "@/lib/call-recording-storage.server"
    );
    expect(callRecordingStoragePath("w1", "CA123")).toBe(
      "w1/recording-CA123.mp3",
    );
  });

  test("fetchTwilioRecordingMp3 downloads with workspace basic auth", async () => {
    const { fetchTwilioRecordingMp3 } = await import(
      "@/lib/call-recording-storage.server"
    );

    const buffer = await fetchTwilioRecordingMp3(
      "ACmain",
      "RE1",
      { sid: "ACsub", authToken: "secret" },
      { fetch: mocks.fetch, maxAttempts: 1, baseDelayMs: 0 },
    );

    expect(buffer.toString()).toBe("audio-bytes");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/ACmain/Recordings/RE1.mp3",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
  });

  test("fetchTwilioRecordingMp3 retries transient HTTP failures", async () => {
    const { fetchTwilioRecordingMp3 } = await import(
      "@/lib/call-recording-storage.server"
    );

    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: "Unavailable" }))
      .mockResolvedValueOnce(
        new Response(Buffer.from("ok"), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      );

    const buffer = await fetchTwilioRecordingMp3(
      "ACmain",
      "RE1",
      { sid: "ACsub", authToken: "secret" },
      { fetch: mocks.fetch, maxAttempts: 2, baseDelayMs: 0 },
    );

    expect(buffer.toString()).toBe("ok");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  test("persistCallRecordingToStorage uploads and returns audio_url path", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    const result = await persistCallRecordingToStorage(
      {
        workspaceId: "w1",
        callSid: "CA1",
        accountSid: "ACmain",
        recordingSid: "RE1",
      },
      {
        fetch: mocks.fetch,
        uploadObject: mocks.uploadObject,
        loadCredentials: mocks.loadWorkspaceTwilioCredentials,
        maxAttempts: 1,
        baseDelayMs: 0,
      },
    );

    expect(result).toEqual({
      ok: true,
      audioUrl: "w1/recording-CA1.mp3",
      skipped: false,
    });
    expect(mocks.uploadObject).toHaveBeenCalledWith(
      "workspaceAudio",
      "w1/recording-CA1.mp3",
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "audio/mpeg",
        upsert: true,
      }),
    );
  });

  test("persistCallRecordingToStorage skips when audio_url already set", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    const result = await persistCallRecordingToStorage(
      {
        workspaceId: "w1",
        callSid: "CA1",
        accountSid: "ACmain",
        recordingSid: "RE1",
        existingAudioUrl: "w1/recording-CA1.mp3",
      },
      {
        fetch: mocks.fetch,
        uploadObject: mocks.uploadObject,
        loadCredentials: mocks.loadWorkspaceTwilioCredentials,
      },
    );

    expect(result).toEqual({
      ok: true,
      audioUrl: "w1/recording-CA1.mp3",
      skipped: true,
      reason: "already_persisted",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  test("persistCallRecordingToStorage returns download_failed without throwing", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 404, statusText: "Not Found" }),
    );

    const result = await persistCallRecordingToStorage(
      {
        workspaceId: "w1",
        callSid: "CA1",
        accountSid: "ACmain",
        recordingSid: "RE1",
      },
      {
        fetch: mocks.fetch,
        uploadObject: mocks.uploadObject,
        loadCredentials: mocks.loadWorkspaceTwilioCredentials,
        maxAttempts: 1,
        baseDelayMs: 0,
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "download_failed",
      error: expect.stringContaining("404"),
    });
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });
});
