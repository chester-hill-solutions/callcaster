import { beforeEach, describe, expect, test, vi } from "vitest";
import { liveTranscriptionKey } from "../shared/billing-keys";
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

const coachingEngineMocks = vi.hoisted(() => ({
  createCoachingState: vi.fn(),
  processUtterance: vi.fn(),
  finalizeCoachingSession: vi.fn(),
}));

const ledgerMocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
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

vi.mock("../services/media-stream/coaching-engine", () => ({
  createCoachingState: (...args: unknown[]) => coachingEngineMocks.createCoachingState(...args),
  processUtterance: (...args: unknown[]) => coachingEngineMocks.processUtterance(...args),
  finalizeCoachingSession: (...args: unknown[]) =>
    coachingEngineMocks.finalizeCoachingSession(...args),
}));

// coaching-billing is NOT mocked — the real debit helper runs against a mocked
// ledger, so these tests exercise the actual key and amount the service writes.
vi.mock("@/lib/transaction-history.server", () => ({
  insertTransactionHistoryIdempotent: (...args: unknown[]) =>
    ledgerMocks.insertTransactionHistoryIdempotent(...args),
}));

function createMockWebSocket(): import("bun").ServerWebSocket<MediaStreamSocketData> {
  return {
    data: {
      workspaceId: "ws-1",
      campaignId: "camp-1",
      userId: "user-1",
      sessionId: "session-1",
      exp: Math.floor(Date.now() / 1000) + 60,
      requestId: "req-1",
    },
  } as import("bun").ServerWebSocket<MediaStreamSocketData>;
}

const START_MESSAGE = {
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
} as const;

function capabilities(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    featureFlags: {},
    coachingConfig: {},
    capabilities: {
      attachStream: true,
      runCoaching: false,
      showTranscript: true,
      showCoaching: false,
      ...overrides,
    },
  };
}

function transcriptionDebits() {
  return ledgerMocks.insertTransactionHistoryIdempotent.mock.calls
    .map((call) => call[1] as { idempotencyKey: string; amount: number; note: string })
    .filter((args) => args.idempotencyKey === liveTranscriptionKey("CA123"));
}

describe("live transcription billing follows the STT lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();

    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockReset();
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue(capabilities());

    sttMocks.openElevenLabsRealtimeStream.mockReset();
    sttMocks.openElevenLabsRealtimeStream.mockResolvedValue({ send: vi.fn(), close: vi.fn() });

    dbWriterMocks.writeTranscriptSegment.mockReset();
    dbWriterMocks.publishTranscriptSegmentEvent.mockReset();

    coachingEngineMocks.createCoachingState.mockReset();
    coachingEngineMocks.createCoachingState.mockReturnValue({ callSid: "CA123" });
    coachingEngineMocks.finalizeCoachingSession.mockReset();
    coachingEngineMocks.finalizeCoachingSession.mockResolvedValue(undefined);

    ledgerMocks.insertTransactionHistoryIdempotent.mockReset();
    ledgerMocks.insertTransactionHistoryIdempotent.mockResolvedValue({ inserted: true });
  });

  test("a transcription-only workspace with no coaching is billed on stop", async () => {
    // The regression this locks: STT opens unconditionally, but the debit used
    // to live inside finalizeCoachingSession, so these workspaces ran for free.
    vi.useFakeTimers();
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    await handleTwilioStreamMessage(ws, START_MESSAGE);
    vi.advanceTimersByTime(3 * 60_000);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    expect(coachingEngineMocks.finalizeCoachingSession).not.toHaveBeenCalled();
    expect(transcriptionDebits()).toHaveLength(1);
    expect(transcriptionDebits()[0]).toMatchObject({
      idempotencyKey: liveTranscriptionKey("CA123"),
      note: "Live transcription CA123",
    });
    expect(transcriptionDebits()[0]!.amount).toBeLessThan(0);
  });

  test("bills from the STT clock, not the coaching state's clock", async () => {
    vi.useFakeTimers();
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    await handleTwilioStreamMessage(ws, START_MESSAGE);
    vi.advanceTimersByTime(10 * 60_000);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    // 10 min * 0.43 credits/min = 4.3 -> ceil 5.
    expect(transcriptionDebits()[0]!.amount).toBe(-5);
  });

  test("a coaching workspace is billed exactly once — no double-bill", async () => {
    vi.useFakeTimers();
    workspaceConfigMocks.loadWorkspaceMediaStreamConfig.mockResolvedValue(
      capabilities({ runCoaching: true, showCoaching: true }),
    );

    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    await handleTwilioStreamMessage(ws, START_MESSAGE);
    vi.advanceTimersByTime(2 * 60_000);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    expect(coachingEngineMocks.finalizeCoachingSession).toHaveBeenCalledTimes(1);
    expect(transcriptionDebits()).toHaveLength(1);
  });

  test("a repeated stop does not bill twice", async () => {
    vi.useFakeTimers();
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    await handleTwilioStreamMessage(ws, START_MESSAGE);
    vi.advanceTimersByTime(2 * 60_000);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    expect(transcriptionDebits()).toHaveLength(1);
  });

  test("an STT stream that never opened is not billed", async () => {
    sttMocks.openElevenLabsRealtimeStream.mockResolvedValue(null);

    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    await handleTwilioStreamMessage(ws, START_MESSAGE);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    expect(transcriptionDebits()).toHaveLength(0);
  });

  test("an instantly-stopped stream writes no zero debit", async () => {
    const { handleTwilioStreamMessage } = await import("../services/media-stream/twilio-handler");
    const ws = createMockWebSocket();

    // Real timers: start and stop land in the same millisecond => 0ms of STT.
    await handleTwilioStreamMessage(ws, START_MESSAGE);
    await handleTwilioStreamMessage(ws, { event: "stop", streamSid: "MZstream" });

    for (const debit of transcriptionDebits()) {
      expect(debit.amount).toBeLessThan(0);
    }
  });
});
