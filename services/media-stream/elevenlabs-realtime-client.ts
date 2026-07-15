import type { ElevenLabsCommittedTranscriptMessage, ElevenLabsRealtimeEvent } from "./types";

const ELEVENLABS_REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export type ElevenLabsCommittedCallback = (
  event: ElevenLabsCommittedTranscriptMessage,
) => void | Promise<void>;

export interface ElevenLabsRealtimeStream {
  send: (audio: Buffer) => void;
  close: () => void;
}

export type ElevenLabsRealtimeClientDeps = {
  apiKey?: string;
  realtimeUrl?: string;
  WebSocketImpl?: typeof WebSocket;
};

function buildElevenLabsRealtimeUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: "ulaw_8000",
    commit_strategy: "vad",
    include_timestamps: "true",
  });
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Parses an ElevenLabs realtime WebSocket message payload.
 * @throws Error when JSON is invalid.
 */
export function parseElevenLabsRealtimeMessage(raw: string): ElevenLabsRealtimeEvent {
  return JSON.parse(raw) as ElevenLabsRealtimeEvent;
}

export function isCommittedTranscriptEvent(
  event: ElevenLabsRealtimeEvent,
): event is ElevenLabsCommittedTranscriptMessage {
  return (
    event.message_type === "committed_transcript_with_timestamps" &&
    typeof event.text === "string" &&
    event.text.trim().length > 0
  );
}

/**
 * Opens an ElevenLabs Scribe v2 realtime WebSocket (ulaw 8kHz, VAD commits).
 * Returns null when ELEVENLABS_API_KEY is unset (local demos without transcription).
 */
export async function openElevenLabsRealtimeStream(
  workspaceId: string,
  onCommitted: ElevenLabsCommittedCallback,
  deps: ElevenLabsRealtimeClientDeps = {},
): Promise<ElevenLabsRealtimeStream | null> {
  const apiKey = deps.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log(
      JSON.stringify({
        level: "warn",
        message: "ELEVENLABS_API_KEY not set; skipping ElevenLabs STT stream",
        workspaceId,
      }),
    );
    return null;
  }

  const WebSocketImpl = deps.WebSocketImpl ?? WebSocket;
  const url = buildElevenLabsRealtimeUrl(deps.realtimeUrl ?? ELEVENLABS_REALTIME_URL);
  const ws = new WebSocketImpl(url, {
    headers: { "xi-api-key": apiKey },
  });

  const stream: ElevenLabsRealtimeStream = {
    send(audio: Buffer) {
      if (ws.readyState === WebSocketImpl.OPEN) {
        ws.send(
          JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: audio.toString("base64"),
            commit: false,
            sample_rate: 8000,
          }),
        );
      }
    },
    close() {
      ws.close();
    },
  };

  ws.addEventListener("message", (event) => {
    void (async () => {
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const data = parseElevenLabsRealtimeMessage(raw);
        if (!isCommittedTranscriptEvent(data)) return;
        await onCommitted(data);
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "elevenlabs realtime parse error",
            workspaceId,
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (event) => {
      reject(event instanceof ErrorEvent ? event.error : new Error("ElevenLabs WebSocket error"));
    });
  });

  return stream;
}
