import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MediaStreamSocketData, TwilioMediaFormat } from "../services/media-stream/types";

const sttMocks = vi.hoisted(() => ({
  openElevenLabsRealtimeStream: vi.fn(),
}));

const workspaceConfigMocks = vi.hoisted(() => ({
  loadWorkspaceMediaStreamConfig: vi.fn(),
}));

const dbWriterMocks = vi.hoisted(() => ({
  writeTranscriptSegment: vi.fn(),
  publishTranscriptSegmentEvent: vi.fn(),
}));

vi.mock("../services/media-stream/elevenlabs-realtime-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/media-stream/elevenlabs-realtime-client")>();
  return {
    ...actual,
    openElevenLabsRealtimeStream: sttMocks.openElevenLabsRealtimeStream,
  };
});

vi.mock("../services/media-stream/db-writer", () => ({
  writeTranscriptSegment: (...args: unknown[]) => dbWriterMocks.writeTranscriptSegment(...args),
  publishTranscriptSegmentEvent: (...args: unknown[]) =>
    dbWriterMocks.publishTranscriptSegmentEvent(...args),
}));

vi.mock("../services/media-stream/workspace-config", () => ({
  loadWorkspaceMediaStreamConfig: (...args: unknown[]) =>
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig(...args),
}));

const coachingEngineMocks = vi.hoisted(() => ({
  createCoachingState: vi.fn(),
  processUtterance: vi.fn(),
  finalizeCoachingSession: vi.fn(),
}));

vi.mock("../services/media-stream/coaching-engine", () => ({
  createCoachingState: (...args: unknown[]) => coachingEngineMocks.createCoachingState(...args),
  processUtterance: (...args: unknown[]) => coachingEngineMocks.processUtterance(...args),
  finalizeCoachingSession: (...args: unknown[]) =>
    coachingEngineMocks.finalizeCoachingSession(...args),
}));

// The stop path debits live transcription from the STT clock. Stub the ledger
// so this suite stays a protocol test; the debit itself is covered in
// test/media-stream-transcription-billing.test.ts.
const billingMocks = vi.hoisted(() => ({
  billLiveTranscription: vi.fn(),
}));

vi.mock("../services/media-stream/coaching-billing", () => ({
  billLiveTranscription: (...args: unknown[]) => billingMocks.billLiveTranscription(...args),
}));

function createMockWebSocket(data: MediaStreamSocketData) {
  return { data, close: vi.fn() } as import("bun").ServerWebSocket<MediaStreamSocketData>;
}

const audioCleanup: Array<() => Promise<void>> = [];
async function startAudio(tracks: string[], deferOpen = false,
  mediaFormat: TwilioMediaFormat = { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 }) {
  const { handleTwilioStreamMessage: handle } = await import("../services/media-stream/twilio-handler");
  const ws = createMockWebSocket({
    workspaceId: "ws-1", campaignId: "camp-1", userId: "user-1", sessionId: "session-1",
    callSid: "CA123", exp: Math.floor(Date.now() / 1000) + 60, requestId: "req-audio",
  });
  const stream = { send: vi.fn<(audio: Buffer) => void>(), close: vi.fn() };
  let open = () => {}, failOpen = () => {};
  const opening = new Promise<typeof stream>((resolve, reject) => {
    open = () => resolve(stream); failOpen = () => reject(new Error("Owned upstream open failure"));
  });
  sttMocks.openElevenLabsRealtimeStream.mockReturnValueOnce(deferOpen ? opening : Promise.resolve(stream));
  const starting = handle(ws, { event: "start", streamSid: "MZstream", start: {
    streamSid: "MZstream", accountSid: "AC123", callSid: "CA123", tracks,
    mediaFormat,
  } });
  audioCleanup.push(async () => {
    const stopping = handle(ws, { event: "stop" });
    open(); await Promise.allSettled([starting, stopping]);
  });
  if (!deferOpen) await starting;
  return { ws, stream, handle, starting, open, failOpen };
}

describe("twilio-handler", () => {
  afterEach(async () => {
    await Promise.allSettled(audioCleanup.splice(0).map(cleanup => cleanup()));
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.resetModules();
    sttMocks.openElevenLabsRealtimeStream.mockReset();
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockReset();
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue({
      featureFlags: {},
      coachingConfig: {},
      capabilities: {
        attachStream: true,
        runCoaching: false,
        showTranscript: true,
        showCoaching: false,
      },
    });
    dbWriterMocks.writeTranscriptSegment.mockReset();
    dbWriterMocks.publishTranscriptSegmentEvent.mockReset();
    coachingEngineMocks.createCoachingState.mockReset();
    coachingEngineMocks.createCoachingState.mockReturnValue({ callSid: "CA123" });
    coachingEngineMocks.processUtterance.mockReset();
    coachingEngineMocks.processUtterance.mockResolvedValue(undefined);
    coachingEngineMocks.finalizeCoachingSession.mockReset();
    coachingEngineMocks.finalizeCoachingSession.mockResolvedValue(undefined);
    billingMocks.billLiveTranscription.mockReset();
    billingMocks.billLiveTranscription.mockResolvedValue({ billed: true, credits: 1 });

    const send = vi.fn();
    const close = vi.fn();
    sttMocks.openElevenLabsRealtimeStream.mockResolvedValue({ send, close });

    dbWriterMocks.writeTranscriptSegment.mockResolvedValue({
      id: "seg-uuid-1",
      call_sid: "CA123",
      speaker: 0,
      speaker_label: "agent",
      text: "Hello",
      start_ms: 100,
      end_ms: 500,
      confidence: 0.95,
      filler_count: 0,
      is_final: true,
      created_at: new Date().toISOString(),
    });
    dbWriterMocks.publishTranscriptSegmentEvent.mockResolvedValue(undefined);
  });

  test("connected is a no-op", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    await handleTwilioStreamMessage(ws, { event: "connected", protocol: "Call", version: "1.0.0" });
    expect(sttMocks.openElevenLabsRealtimeStream).not.toHaveBeenCalled();
  });

  test.each([
    ["runs coaching when runCoaching is true", true, true],
    ["skips coaching when runCoaching is false", false, false],
  ])("start %s", async (_name, runCoaching, expectCreated) => {
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue({
      featureFlags: {},
      coachingConfig: {},
      capabilities: {
        attachStream: true,
        runCoaching,
        showTranscript: false,
        showCoaching: runCoaching,
      },
    });

    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    await handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    expect(coachingEngineMocks.createCoachingState.mock.calls.length > 0).toBe(expectCreated);
  });

  test("rejects a start frame whose callSid does not match the token (#1514)", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const close = vi.fn();
    const ws = {
      data: {
        workspaceId: "ws-1",
        campaignId: "camp-1",
        userId: "user-1",
        sessionId: "session-1",
        callSid: "CA_token",
        exp: Math.floor(Date.now() / 1000) + 60,
        requestId: "req-1",
      },
      close,
    } as unknown as import("bun").ServerWebSocket<MediaStreamSocketData>;

    await handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA_other_workspace",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    expect(close).toHaveBeenCalledWith(1008, "call_sid_mismatch");
    expect(sttMocks.openElevenLabsRealtimeStream).not.toHaveBeenCalled();
  });

  // #2889: the #1514 check above only refused a *mismatch*. A frame that named
  // no call at all was allowed, and the token's own SID was not required, so a
  // start frame could pick the row key freely.
  test("rejects a start frame that names no call (#2889)", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const close = vi.fn();
    const ws = {
      data: {
        workspaceId: "ws-1",
        campaignId: "camp-1",
        userId: "user-1",
        sessionId: "session-1",
        callSid: "CA_token",
        exp: Math.floor(Date.now() / 1000) + 60,
        requestId: "req-1",
      },
      close,
    } as unknown as import("bun").ServerWebSocket<MediaStreamSocketData>;

    await handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    expect(close).toHaveBeenCalledWith(1008, "call_sid_mismatch");
    expect(sttMocks.openElevenLabsRealtimeStream).not.toHaveBeenCalled();
  });

  test("accepts a start frame whose callSid matches the token (#1514)", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const close = vi.fn();
    const ws = {
      data: {
        workspaceId: "ws-1",
        campaignId: "camp-1",
        userId: "user-1",
        sessionId: "session-1",
        callSid: "CA_token",
        exp: Math.floor(Date.now() / 1000) + 60,
        requestId: "req-1",
      },
      close,
    } as unknown as import("bun").ServerWebSocket<MediaStreamSocketData>;

    await handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA_token",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    expect(close).not.toHaveBeenCalled();
    expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalled();
  });

  test("start opens ElevenLabs STT and media forwards decoded mulaw audio", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    await handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledWith("ws-1", expect.any(Function));

    const audioPayload = Buffer.from("mulaw-audio").toString("base64");
    await handleTwilioStreamMessage(ws, {
      event: "media",
      streamSid: "MZstream",
      media: {
        track: "inbound",
        chunk: "1",
        timestamp: "0",
        payload: audioPayload,
      },
    });

    const stream = await sttMocks.openElevenLabsRealtimeStream.mock.results[0]?.value;
    expect(stream?.send).toHaveBeenCalledWith(Buffer.from("mulaw-audio"));
  });

  test("simultaneous tracks occupy one mono timeline (#2879)", async () => {
    const { ws, stream, handle } = await startAudio(["inbound", "outbound"]);
    for (const [track, sample] of [["inbound", 0x90], ["outbound", 0x10]] as const) {
      await handle(ws, { event: "media", streamSid: "MZstream", media: {
        track, chunk: "1", timestamp: "0", payload: Buffer.alloc(160, sample).toString("base64"),
      } });
    }
    await handle(ws, { event: "stop", streamSid: "MZstream" });

    // 160 samples at 8kHz are 20ms. G.711 +15996 and -15996 sum to silence.
    const audio = Buffer.concat(stream.send.mock.calls.map(([chunk]) => chunk));
    expect(audio).toHaveLength(160);
    expect(audio).toEqual(Buffer.alloc(160, 0xff));
    expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledTimes(1);
  });

  test("both speakers survive single-sided audio and missing-track deadlines", async () => {
    vi.useFakeTimers();
    const { ws, stream, handle } = await startAudio(["inbound", "outbound"]);
    await handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "0",
      payload: Buffer.alloc(160, 0x90).toString("base64") } });
    await vi.advanceTimersByTimeAsync(200);
    await handle(ws, { event: "media", media: { track: "outbound", chunk: "1", timestamp: "20",
      payload: Buffer.alloc(160, 0xaf).toString("base64") } });
    await handle(ws, { event: "stop" });
    expect(Buffer.concat(stream.send.mock.calls.map(([chunk]) => chunk)))
      .toEqual(Buffer.concat([Buffer.alloc(160, 0x90), Buffer.alloc(160, 0xaf)]));
    expect(Number(stream.send.mock.invocationCallOrder.at(-1))).toBeLessThan(Number(stream.close.mock.invocationCallOrder[0]));
    await handle(ws, { event: "stop" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(billingMocks.billLiveTranscription).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("media received while STT opens is retained on the same clock", async () => {
    const { ws, stream, handle, starting, open } = await startAudio(["inbound", "outbound"], true);
    try {
      await vi.waitFor(() => expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledTimes(1));
      for (const [track, sample] of [["inbound", 0x90], ["outbound", 0xff]] as const) {
        await handle(ws, { event: "media", media: { track, chunk: "1", timestamp: "0",
          payload: Buffer.alloc(160, sample).toString("base64") } });
      }
      expect(stream.send).not.toHaveBeenCalled();
      open(); await starting;
      expect(Buffer.concat(stream.send.mock.calls.map(([chunk]) => chunk))).toEqual(Buffer.alloc(160, 0x90));
    } finally {
      open(); await Promise.allSettled([starting]); await handle(ws, { event: "stop" });
    }
  });

  test("stop retires buffers before delayed coaching lets a late STT open finish", async () => {
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue({
      capabilities: { runCoaching: true }, coachingConfig: {},
    });
    let finish = () => {};
    coachingEngineMocks.finalizeCoachingSession.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const { ws, stream, handle, starting, open } = await startAudio(["inbound", "outbound"], true);
    await vi.waitFor(() => expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledTimes(1));
    await handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "0",
      payload: Buffer.alloc(160, 0x90).toString("base64") } });
    const stopping = handle(ws, { event: "stop" });
    try {
      expect(ws.data.twilio?.phase).toBe("stopped");
      expect(ws.data.twilio?.audioTimeline).toBeNull();
      open(); await starting;
      expect(stream.close).toHaveBeenCalledTimes(1); expect(stream.send).not.toHaveBeenCalled();
      await handle(ws, { event: "stop" });
      finish(); await stopping;
      expect(coachingEngineMocks.finalizeCoachingSession).toHaveBeenCalledTimes(1);
      expect(billingMocks.billLiveTranscription).not.toHaveBeenCalled();
    } finally {
      open(); finish(); await Promise.allSettled([starting, stopping]); await handle(ws, { event: "stop" });
    }
  });

  test("upstream open failure releases buffered audio and closes its socket", async () => {
    const { ws, handle, starting, failOpen } = await startAudio(["inbound", "outbound"], true);
    try {
      await vi.waitFor(() => expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledTimes(1));
      await handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "0",
        payload: Buffer.alloc(160, 0x90).toString("base64") } });
      const failed = expect(starting).rejects.toThrow("Owned upstream open failure");
      failOpen(); await failed;
      expect(ws.data.twilio?.phase).toBe("stopped"); expect(ws.data.twilio?.audioTimeline).toBeNull();
      expect(ws.close).toHaveBeenCalledWith(1011, "stt_open_failed");
      expect(billingMocks.billLiveTranscription).not.toHaveBeenCalled();
    } finally {
      failOpen(); await Promise.allSettled([starting]); await handle(ws, { event: "stop" });
    }
  });

  test("duplicate start cannot replace the existing STT owner", async () => {
    const { ws, stream, handle } = await startAudio(["inbound"]);
    await handle(ws, { event: "start", start: { callSid: "CA123", streamSid: "MZsecond", accountSid: "AC123",
      tracks: ["inbound"], mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
    expect(sttMocks.openElevenLabsRealtimeStream).toHaveBeenCalledTimes(1);
    expect(stream.close).toHaveBeenCalledTimes(1); expect(ws.data.twilio?.phase).toBe("stopped");
    expect(ws.close).toHaveBeenCalledWith(1008, "duplicate_stream_start");
  });

  test("an invalid start retires the socket before queued valid frames can open STT", async () => {
    const { ws, handle } = await startAudio(["other"]);
    await handle(ws, { event: "start", start: { callSid: "CA123", streamSid: "MZstream", accountSid: "AC123",
      tracks: ["inbound"], mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
    expect(ws.data.twilio?.phase).toBe("stopped");
    expect(ws.data.twilio?.audioTimeline).toBeNull();
    expect(sttMocks.openElevenLabsRealtimeStream).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(1008, "unsupported_audio_tracks");
  });

  test.each([
    { encoding: "audio/pcm", sampleRate: 8000, channels: 1 },
    { encoding: "audio/x-mulaw", sampleRate: 16000, channels: 1 },
    { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 2 },
  ])("rejects a format that cannot share the mono 8kHz clock: $encoding/$sampleRate/$channels", async format => {
    const { ws, handle } = await startAudio(["inbound"], false, format);
    try {
      expect(sttMocks.openElevenLabsRealtimeStream).not.toHaveBeenCalled();
      expect(ws.data.twilio?.phase).toBe("stopped");
      expect(ws.close).toHaveBeenCalledWith(1008, "unsupported_audio_format");
    } finally { await handle(ws, { event: "stop" }); }
  });

  test("invalid timeline input stops and releases the stream before close", async () => {
    const { ws, stream, handle } = await startAudio(["inbound"]);
    await handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "10001",
      payload: Buffer.alloc(160, 0x90).toString("base64") } });
    expect(stream.send).not.toHaveBeenCalled(); expect(stream.close).toHaveBeenCalledTimes(1);
    expect(ws.data.twilio?.phase).toBe("stopped"); expect(ws.data.twilio?.audioTimeline).toBeNull();
    expect(ws.close).toHaveBeenCalledWith(1008, "invalid_audio_timeline");
  });

  test("a timed send failure cancels remaining audio and closes its owner", async () => {
    vi.useFakeTimers();
    const { ws, stream, handle } = await startAudio(["inbound", "outbound"]);
    stream.send.mockImplementationOnce(() => { throw new Error("Owned audio send failure"); });
    await handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "0",
      payload: Buffer.alloc(160, 0x90).toString("base64") } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ws.data.twilio?.phase).toBe("stopped"); expect(stream.close).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledWith(1011, "audio_stream_failed"); expect(vi.getTimerCount()).toBe(0);
  });

  test("invalid audio closes its socket before slow coaching cleanup completes", async () => {
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue({
      capabilities: { runCoaching: true }, coachingConfig: {},
    });
    let finish = () => {};
    coachingEngineMocks.finalizeCoachingSession.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const { ws, handle } = await startAudio(["inbound"]);
    const stopping = handle(ws, { event: "media", media: { track: "inbound", chunk: "1", timestamp: "10001",
      payload: Buffer.alloc(160, 0x90).toString("base64") } });
    try {
      expect(ws.close).toHaveBeenCalledWith(1008, "invalid_audio_timeline");
      expect(ws.data.twilio?.phase).toBe("stopped");
    } finally { finish(); await stopping; }
  });

  test("a stop during STT open closes the orphaned stream and never assigns it", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    // Control when the STT open resolves so we can inject a stop mid-await.
    let resolveOpen!: (v: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }) => void;
    const opening = new Promise<{ send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>(
      (resolve) => {
        resolveOpen = resolve;
      },
    );
    sttMocks.openElevenLabsRealtimeStream.mockReturnValueOnce(opening);

    const startPromise = handleTwilioStreamMessage(ws, {
      event: "start",
      streamSid: "MZstream",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: { direction: "outbound" },
      },
    });

    // Let the start handler run up to the (still-pending) STT open await.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The call ends while STT is still opening.
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    // STT finishes opening after the stop — the resumed start handler must close it.
    const send = vi.fn();
    const close = vi.fn();
    resolveOpen({ send, close });
    await startPromise;

    expect(close).toHaveBeenCalledTimes(1);

    // The orphaned stream was never wired to state, so media doesn't forward to it.
    await handleTwilioStreamMessage(ws, {
      event: "media",
      streamSid: "MZstream",
      media: {
        track: "inbound",
        chunk: "1",
        timestamp: "5",
        payload: Buffer.from("x").toString("base64"),
      },
    });
    expect(send).not.toHaveBeenCalled();
    // No billing for a stream that only opened after the call ended.
    expect(billingMocks.billLiveTranscription).not.toHaveBeenCalled();
  });

  test("committed transcript persists segment and publishes workspace event", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    await handleTwilioStreamMessage(ws, {
      event: "start",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
      },
    });

    const onCommitted = sttMocks.openElevenLabsRealtimeStream.mock.calls[0]?.[1] as (
      event: unknown,
    ) => Promise<void>;

    await onCommitted({
      message_type: "committed_transcript_with_timestamps",
      text: "uh hello there",
      words: [
        { text: "uh", start: 0.1, end: 0.2, type: "word", speaker_id: "speaker_0", logprob: -0.1 },
        {
          text: "hello",
          start: 0.3,
          end: 0.6,
          type: "word",
          speaker_id: "speaker_0",
          logprob: -0.1,
        },
        {
          text: "there",
          start: 0.7,
          end: 1.0,
          type: "word",
          speaker_id: "speaker_0",
          logprob: -0.1,
        },
      ],
    });

    expect(dbWriterMocks.writeTranscriptSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        call_sid: "CA123",
        speaker: 0,
        speaker_label: "agent",
        text: "uh hello there",
        filler_count: 1,
        is_final: true,
      }),
      // The writer is told which workspace owns the call, so the unscoped
      // insert can never land on another tenant's call SID.
      "ws-1",
    );
    expect(dbWriterMocks.publishTranscriptSegmentEvent).toHaveBeenCalledWith(
      "ws-1",
      "CA123",
      expect.objectContaining({ id: "seg-uuid-1" }),
    );
  });

  test("stop closes ElevenLabs STT stream", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      callSid: "CA123",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    });

    await handleTwilioStreamMessage(ws, {
      event: "start",
      start: {
        streamSid: "MZstream",
        accountSid: "AC123",
        callSid: "CA123",
        tracks: ["inbound"],
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
      },
    });

    const stt = await sttMocks.openElevenLabsRealtimeStream.mock.results[0]?.value;

    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    expect(stt.close).toHaveBeenCalled();
    expect(ws.data.twilio?.phase).toBe("stopped");
  });
});
