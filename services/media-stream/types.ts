import type { ServerWebSocket } from "bun";
import type { MediaStreamTokenPayload } from "@/lib/media-stream-token.server";
import type { ElevenLabsRealtimeStream } from "./elevenlabs-realtime-client";

/** Twilio Media Streams protocol events. */
export type TwilioStreamEvent = "connected" | "start" | "media" | "stop" | "mark";

export interface TwilioMediaFormat {
  encoding: string;
  sampleRate: number;
  channels: number;
}

export interface TwilioStartPayload {
  streamSid: string;
  accountSid: string;
  callSid: string;
  tracks: string[];
  mediaFormat: TwilioMediaFormat;
  customParameters?: Record<string, string>;
}

export interface TwilioMediaPayload {
  track: string;
  chunk: string;
  timestamp: string;
  payload: string;
}

export interface TwilioStopPayload {
  accountSid: string;
  callSid: string;
}

export interface TwilioConnectedMessage {
  event: "connected";
  protocol?: string;
  version?: string;
}

export interface TwilioStartMessage {
  event: "start";
  sequenceNumber?: string;
  streamSid?: string;
  start: TwilioStartPayload;
}

export interface TwilioMediaMessage {
  event: "media";
  sequenceNumber?: string;
  streamSid?: string;
  media: TwilioMediaPayload;
}

export interface TwilioStopMessage {
  event: "stop";
  sequenceNumber?: string;
  streamSid?: string;
  stop?: TwilioStopPayload;
  code?: number;
  reason?: string;
}

export interface TwilioMarkMessage {
  event: "mark";
  sequenceNumber?: string;
  streamSid?: string;
  mark?: { name: string };
}

export type TwilioStreamMessage =
  | TwilioConnectedMessage
  | TwilioStartMessage
  | TwilioMediaMessage
  | TwilioStopMessage
  | TwilioMarkMessage;

export type TwilioStreamPhase = "init" | "streaming" | "stopped";

export interface TwilioStreamState {
  phase: TwilioStreamPhase;
  streamSid?: string;
  callSid?: string;
  direction?: string;
  stt?: ElevenLabsRealtimeStream | null;
  startTime?: number;
  /**
   * Epoch ms the realtime STT stream actually opened, and the clock the
   * live-transcription debit is measured from. Cleared once billed so a
   * repeated stop cannot re-enter the debit path.
   */
  sttOpenedAt?: number | null;
  coaching?: import("./coaching-state").CoachingState | null;
}

export type MediaStreamSocketData = MediaStreamTokenPayload & {
  requestId: string;
  twilio?: TwilioStreamState;
};

export type MediaStreamWebSocket = ServerWebSocket<MediaStreamSocketData>;

/** ElevenLabs Scribe v2 realtime WebSocket event shapes. */
export interface ElevenLabsWord {
  text: string;
  start: number | null;
  end: number | null;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string | null;
  logprob?: number;
}

export interface ElevenLabsCommittedTranscriptMessage {
  message_type: "committed_transcript" | "committed_transcript_with_timestamps";
  text: string;
  language_code?: string;
  words?: ElevenLabsWord[];
}

export interface ElevenLabsPartialTranscriptMessage {
  message_type: "partial_transcript";
  text: string;
}

export interface ElevenLabsSessionStartedMessage {
  message_type: "session_started";
  session_id: string;
}

export interface ElevenLabsErrorMessage {
  message_type: "error";
  error: string;
}

export type ElevenLabsRealtimeEvent =
  | ElevenLabsCommittedTranscriptMessage
  | ElevenLabsPartialTranscriptMessage
  | ElevenLabsSessionStartedMessage
  | ElevenLabsErrorMessage
  | { message_type: string; [key: string]: unknown };

export function isTwilioStreamMessage(value: unknown): value is TwilioStreamMessage {
  if (!value || typeof value !== "object") return false;
  const event = (value as { event?: unknown }).event;
  return (
    event === "connected" ||
    event === "start" ||
    event === "media" ||
    event === "stop" ||
    event === "mark"
  );
}
