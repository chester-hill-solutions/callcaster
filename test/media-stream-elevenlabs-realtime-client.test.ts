import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  isCommittedTranscriptEvent,
  openElevenLabsRealtimeStream,
  parseElevenLabsRealtimeMessage,
} from "../services/media-stream/elevenlabs-realtime-client";

describe("elevenlabs-realtime-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("parseElevenLabsRealtimeMessage parses committed transcript payload", () => {
    const raw = JSON.stringify({
      message_type: "committed_transcript_with_timestamps",
      text: "Hello there",
      words: [
        { text: "Hello", start: 0.1, end: 0.4, type: "word", speaker_id: "speaker_0", logprob: -0.1 },
        { text: "there", start: 0.5, end: 0.9, type: "word", speaker_id: "speaker_0", logprob: -0.2 },
      ],
    });

    const result = parseElevenLabsRealtimeMessage(raw);
    expect(result.message_type).toBe("committed_transcript_with_timestamps");
    expect(result.text).toBe("Hello there");
  });

  test("isCommittedTranscriptEvent requires non-empty timestamped transcript", () => {
    expect(
      isCommittedTranscriptEvent({
        message_type: "committed_transcript_with_timestamps",
        text: "Hi",
      }),
    ).toBe(true);

    expect(
      isCommittedTranscriptEvent({
        message_type: "committed_transcript_with_timestamps",
        text: "   ",
      }),
    ).toBe(false);

    expect(
      isCommittedTranscriptEvent({
        message_type: "committed_transcript",
        text: "ignored without timestamps",
      }),
    ).toBe(false);
  });

  test("openElevenLabsRealtimeStream returns null without API key", async () => {
    const warnSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stream = await openElevenLabsRealtimeStream("ws-1", vi.fn(), { apiKey: "" });
    expect(stream).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test("openElevenLabsRealtimeStream forwards committed transcripts to callback", async () => {
    type WsListener = (event: { data: string }) => void;

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      private listeners = new Map<string, WsListener[]>();

      constructor(
        _url: string,
        _options?: { headers?: Record<string, string> },
      ) {
        queueMicrotask(() => {
          this.emit("open", {});
          this.emit("message", {
            data: JSON.stringify({
              message_type: "committed_transcript_with_timestamps",
              text: "Test utterance",
              words: [
                {
                  text: "test",
                  start: 0,
                  end: 0.5,
                  type: "word",
                  speaker_id: "speaker_1",
                  logprob: -0.1,
                },
              ],
            }),
          });
        });
      }

      addEventListener(type: string, listener: WsListener) {
        const bucket = this.listeners.get(type) ?? [];
        bucket.push(listener);
        this.listeners.set(type, bucket);
      }

      send(_data: unknown) {}

      close() {}

      private emit(type: string, event: { data: string }) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event);
        }
      }
    }

    const onCommitted = vi.fn();
    const stream = await openElevenLabsRealtimeStream("ws-1", onCommitted, {
      apiKey: "test-key",
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
    });

    expect(stream).not.toBeNull();
    await vi.waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    expect(onCommitted.mock.calls[0]?.[0]?.text).toBe("Test utterance");

    stream?.close();
  });
});
