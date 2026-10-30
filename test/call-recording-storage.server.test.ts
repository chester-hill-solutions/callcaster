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
      "call-recordings/w1/recording-CA123.mp3",
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
      audioUrl: "call-recordings/w1/recording-CA1.mp3",
      skipped: false,
    });
    expect(mocks.uploadObject).toHaveBeenCalledWith(
      "workspaceAudio",
      "call-recordings/w1/recording-CA1.mp3",
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
        existingAudioUrl: "call-recordings/w1/recording-CA1.mp3",
      },
      {
        fetch: mocks.fetch,
        uploadObject: mocks.uploadObject,
        loadCredentials: mocks.loadWorkspaceTwilioCredentials,
      },
    );

    expect(result).toEqual({
      ok: true,
      audioUrl: "call-recordings/w1/recording-CA1.mp3",
      skipped: true,
      reason: "already_persisted",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  /**
   * #2166 — INVERTED. This test previously asserted that a failed download
   * resolves `{ ok: false }`. The caller logged the failure and reported
   * success, so the audio was silently lost. It must now throw.
   */
  test("persistCallRecordingToStorage THROWS when the download fails", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 404, statusText: "Not Found" }),
    );

    await expect(
      persistCallRecordingToStorage(
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
      ),
    ).rejects.toThrow(/download_failed.*404/s);

    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  /** An upload failure must be as loud as a download failure. */
  test("persistCallRecordingToStorage THROWS when the upload fails", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    mocks.uploadObject.mockRejectedValueOnce(new Error("bucket unreachable"));

    await expect(
      persistCallRecordingToStorage(
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
      ),
    ).rejects.toThrow(/upload_failed.*bucket unreachable/s);
  });

  /**
   * Missing credentials is permanent, not a transport blip. It still throws —
   * so the failure is visible and dead-lettered rather than silent — but the
   * message says so, because re-driving it will never succeed.
   */
  test("missing credentials throw, and the message marks them permanent", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    await expect(
      persistCallRecordingToStorage(
        {
          workspaceId: "w1",
          callSid: "CA1",
          accountSid: "ACmain",
          recordingSid: "RE1",
        },
        {
          fetch: mocks.fetch,
          uploadObject: mocks.uploadObject,
          loadCredentials: async () => null,
          maxAttempts: 1,
          baseDelayMs: 0,
        },
      ),
    ).rejects.toThrow(/permanent/);

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  /** The already-stored short circuit stays: it is not a failure. */
  test("an already-stored recording skips without touching Twilio", async () => {
    const { persistCallRecordingToStorage } = await import(
      "@/lib/call-recording-storage.server"
    );

    const result = await persistCallRecordingToStorage(
      {
        workspaceId: "w1",
        callSid: "CA1",
        accountSid: "ACmain",
        recordingSid: "RE1",
        existingAudioUrl: "call-recordings/w1/recording-CA1.mp3",
      },
      {
        fetch: mocks.fetch,
        uploadObject: mocks.uploadObject,
        loadCredentials: mocks.loadWorkspaceTwilioCredentials,
      },
    );

    expect(result).toEqual({
      ok: true,
      audioUrl: "call-recordings/w1/recording-CA1.mp3",
      skipped: true,
      reason: "already_persisted",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  const partWorkspace = "11111111-1111-4111-8111-111111111111", partCall = `CA${"a".repeat(32)}`;
  const partAccount = `AC${"c".repeat(32)}`, firstRecording = `RE${"1".repeat(32)}`, secondRecording = `RE${"2".repeat(32)}`;
  const partArgs = (recordingSid = firstRecording) => ({ workspaceId: partWorkspace, callSid: partCall, accountSid: partAccount,
    recordingSid, storageMode: "recording" as const });
  const partDeps = () => ({ fetch: mocks.fetch, uploadObject: mocks.uploadObject,
    loadCredentials: async () => ({ sid: partAccount, authToken: "owned-part-token" }), maxAttempts: 1, baseDelayMs: 0 });

  test.each([false, true])("distinct recording parts retain both original byte streams, prior URL=%s", async (priorUrl) => {
    const { persistCallRecordingToStorage } = await import("@/lib/call-recording-storage.server");
    const objects = new Map<string, Buffer>();
    const upload: typeof import("@/lib/object-storage.server").uploadObject = async (_bucket, key, bytes) => {
      if (!Buffer.isBuffer(bytes)) throw new Error("Recording bytes required");
      objects.set(key, Buffer.from(bytes));
    };
    mocks.fetch.mockResolvedValueOnce(new Response(Buffer.from("before-handoff")))
      .mockResolvedValueOnce(new Response(Buffer.from("after-handoff")));
    const deps = { ...partDeps(), uploadObject: upload };
    const first = await persistCallRecordingToStorage(partArgs(), deps);
    const second = await persistCallRecordingToStorage({ ...partArgs(secondRecording), existingAudioUrl: priorUrl ? first.audioUrl : undefined }, deps);
    expect(second.audioUrl).not.toBe(first.audioUrl); expect(objects.size).toBe(2);
    expect(objects.get(first.audioUrl)?.toString()).toBe("before-handoff");
    expect(objects.get(second.audioUrl)?.toString()).toBe("after-handoff");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  test("an exact stored recording part replays without another download or upload", async () => {
    const { persistCallRecordingToStorage } = await import("@/lib/call-recording-storage.server");
    const path = `call-recordings/${partWorkspace}/recording-${partCall}-${firstRecording}.mp3`;
    expect(await persistCallRecordingToStorage({ ...partArgs(), existingAudioUrl: ` ${path} ` }, partDeps()))
      .toEqual({ ok: true, skipped: true, reason: "already_persisted", audioUrl: path });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.uploadObject).not.toHaveBeenCalled();
  });
  test.each(["another-recording", "another-workspace"])("a URL for %s cannot suppress a new recording part", async (kind) => {
    const { persistCallRecordingToStorage } = await import("@/lib/call-recording-storage.server");
    const previous = kind === "another-recording" ? `call-recordings/${partWorkspace}/recording-${partCall}-${firstRecording}.mp3`
      : `call-recordings/22222222-2222-4222-8222-222222222222/recording-${partCall}-${secondRecording}.mp3`;
    const expected = `call-recordings/${partWorkspace}/recording-${partCall}-${secondRecording}.mp3`;
    expect(await persistCallRecordingToStorage({ ...partArgs(secondRecording), existingAudioUrl: previous }, partDeps()))
      .toEqual({ ok: true, skipped: false, audioUrl: expected });
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.uploadObject).toHaveBeenCalledOnce();
  });
  test("recording parts refuse changed account credentials before download", async () => {
    const { persistCallRecordingToStorage } = await import("@/lib/call-recording-storage.server");
    await expect(persistCallRecordingToStorage(partArgs(), { ...partDeps(),
      loadCredentials: async () => ({ sid: `AC${"f".repeat(32)}`, authToken: "foreign-token" }) })).rejects.toThrow(/account/i);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.uploadObject).not.toHaveBeenCalled();
  });
  test.each(["workspaceId", "callSid", "recordingSid", "accountSid"] as const)("recording parts reject an invalid %s before I/O", async (field) => {
    const { persistCallRecordingToStorage } = await import("@/lib/call-recording-storage.server");
    await expect(persistCallRecordingToStorage({ ...partArgs(), [field]: "../foreign-resource" }, partDeps())).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.uploadObject).not.toHaveBeenCalled();
  });
});
