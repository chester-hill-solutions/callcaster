import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MediaStreamSocketData } from "../services/media-stream/types";

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
  return { data } as import("bun").ServerWebSocket<MediaStreamSocketData>;
}

describe("twilio-handler", () => {
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
        timestamp: "5",
        payload: audioPayload,
      },
    });

    const stream = await sttMocks.openElevenLabsRealtimeStream.mock.results[0]?.value;
    expect(stream?.send).toHaveBeenCalledWith(Buffer.from("mulaw-audio"));
  });

  test("a stop during STT open closes the orphaned stream and never assigns it", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket({
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
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
