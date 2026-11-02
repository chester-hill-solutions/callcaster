import {
  isCommittedTranscriptEvent,
  openElevenLabsRealtimeStream,
} from "./elevenlabs-realtime-client";
import { billLiveTranscription } from "./coaching-billing";
import {
  createCoachingState,
  finalizeCoachingSession,
  processUtterance,
} from "./coaching-engine";
import {
  publishTranscriptSegmentEvent,
  writeTranscriptSegment,
  type TranscriptSegmentInsert,
} from "./db-writer";
import { loadWorkspaceMediaStreamConfig } from "./workspace-config";
import { TwilioAudioTimeline } from "./audio-timeline";
import type {
  ElevenLabsCommittedTranscriptMessage,
  ElevenLabsWord,
  MediaStreamWebSocket,
  TwilioStartMessage,
  TwilioStreamMessage,
  TwilioStreamState,
} from "./types";

const DEFAULT_FILLER_WORDS = new Set(["uh", "um", "like", "you know", "basically", "actually"]);

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, ...meta }));
}

function getOrInitTwilioState(ws: MediaStreamWebSocket): TwilioStreamState {
  if (!ws.data.twilio) {
    ws.data.twilio = { phase: "init" };
  }
  return ws.data.twilio;
}

export function countFillerWords(words: ElevenLabsWord[] | undefined): number {
  if (!words?.length) return 0;
  let count = 0;
  for (const word of words) {
    if (word.type !== "word") continue;
    const normalized = word.text.toLowerCase().replace(/[.,!?]/g, "");
    if (DEFAULT_FILLER_WORDS.has(normalized)) {
      count += 1;
    }
  }
  return count;
}

function speakerIndexFromId(speakerId: string | null | undefined): number {
  if (!speakerId) return 0;
  const match = /(\d+)/.exec(speakerId);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function speakerLabelFor(speaker: number): "agent" | "contact" {
  return speaker === 0 ? "agent" : "contact";
}

function averageWordConfidence(words: ElevenLabsWord[] | undefined): number | null {
  const wordRows = words?.filter((word) => word.type === "word" && typeof word.logprob === "number");
  if (!wordRows?.length) return null;
  const avgLogprob =
    wordRows.reduce((sum, word) => sum + (word.logprob ?? 0), 0) / wordRows.length;
  return Math.min(1, Math.max(0, Math.exp(avgLogprob)));
}

function buildTranscriptSegment(
  callSid: string,
  event: ElevenLabsCommittedTranscriptMessage,
): TranscriptSegmentInsert {
  const words = event.words?.filter((word) => word.type === "word") ?? [];
  const speaker = speakerIndexFromId(words[0]?.speaker_id);
  const startSec = words[0]?.start ?? 0;
  const endSec = words[words.length - 1]?.end ?? startSec;

  return {
    call_sid: callSid,
    speaker,
    speaker_label: speakerLabelFor(speaker),
    text: event.text,
    start_ms: Math.round(startSec * 1000),
    end_ms: Math.round(endSec * 1000),
    confidence: averageWordConfidence(event.words),
    filler_count: countFillerWords(event.words),
    is_final: true,
  };
}

async function handleCommittedTranscript(
  ws: MediaStreamWebSocket,
  state: TwilioStreamState,
  event: ElevenLabsCommittedTranscriptMessage,
): Promise<void> {
  if (!state.callSid || !isCommittedTranscriptEvent(event)) return;

  const segmentInput = buildTranscriptSegment(state.callSid, event);
  const segment = await writeTranscriptSegment(
    segmentInput,
    ws.data.workspaceId,
  );
  await publishTranscriptSegmentEvent(ws.data.workspaceId, state.callSid, segment);

  if (state.coaching) {
    await processUtterance(state.coaching, segment);
  }

  log("info", "transcript segment persisted", {
    callSid: state.callSid,
    workspaceId: ws.data.workspaceId,
    segmentId: segment.id,
    speaker: segment.speaker_label,
  });
}

async function stopTwilioStream(ws: MediaStreamWebSocket, state: TwilioStreamState, code?: number, reason?: string) {
  if (state.phase === "stopped") return;
  // Retire ownership before any await: another stop or a late open cannot reuse it.
  state.phase = "stopped";
  const timeline = state.audioTimeline, stt = state.stt, coaching = state.coaching;
  const sttOpenedAt = state.sttOpenedAt ?? null, endedAt = Date.now();
  state.audioTimeline = null; state.stt = null; state.coaching = null; state.sttOpenedAt = null;
  try { timeline?.flush(); }
  catch { log("error", "twilio audio flush failed", { streamSid: state.streamSid }); }
  finally { timeline?.close(); }
  try { stt?.close(); }
  catch { log("error", "twilio STT close failed", { streamSid: state.streamSid }); }
  try { if (coaching) await finalizeCoachingSession(coaching); }
  finally {
    let transcriptionCredits = 0;
    if (sttOpenedAt !== null && state.callSid) {
      const result = await billLiveTranscription({ workspaceId: ws.data.workspaceId,
        callSid: state.callSid, durationMs: endedAt - sttOpenedAt });
      transcriptionCredits = result.credits;
    }
    log("info", "twilio stream stopped", { workspaceId: ws.data.workspaceId, callSid: state.callSid,
      streamSid: state.streamSid, code, reason, transcriptionCredits });
  }
}

async function closeTwilioStream(ws: MediaStreamWebSocket, state: TwilioStreamState, code: number, reason: string) {
  const stopping = stopTwilioStream(ws, state, code, reason);
  try { ws.close(code, reason); }
  finally { await stopping; }
}

async function openTwilioTranscription(ws: MediaStreamWebSocket, state: TwilioStreamState, direction: string) {
  try {
    const workspaceConfig = await loadWorkspaceMediaStreamConfig(ws.data.workspaceId);
    if (state.phase === "stopped") return null;
    if (workspaceConfig.capabilities.runCoaching && state.callSid) {
      state.coaching = createCoachingState({ callSid: state.callSid, workspaceId: ws.data.workspaceId,
        direction, config: workspaceConfig.coachingConfig });
    }
    return await openElevenLabsRealtimeStream(ws.data.workspaceId, event => handleCommittedTranscript(ws, state, event));
  } catch (error) {
    await closeTwilioStream(ws, state, 1011, "stt_open_failed")
      .catch(() => log("error", "twilio audio stop failed", { streamSid: state.streamSid }));
    throw error;
  }
}

async function prepareTwilioStream(ws: MediaStreamWebSocket, state: TwilioStreamState, msg: TwilioStartMessage) {
  if (state.phase !== "init") {
    await closeTwilioStream(ws, state, 1008, "duplicate_stream_start");
    return false;
  }
  // The DB writes below are keyed only by call_sid, so the call must come
  // from the signed token. A frame that names a different call — or names
  // none at all — is refused, and the frame's value is never used as the
  // row key.
  const tokenCallSid = ws.data.callSid;
  if (
    !tokenCallSid ||
    !msg.start?.callSid ||
    msg.start.callSid !== tokenCallSid
  ) {
    await closeTwilioStream(ws, state, 1008, "call_sid_mismatch");
    return false;
  }
  const direction = msg.start.customParameters?.direction ?? "outbound";

  const format = msg.start.mediaFormat;
  if (format?.encoding !== "audio/x-mulaw" || format.sampleRate !== 8000 || format.channels !== 1) {
    await closeTwilioStream(ws, state, 1008, "unsupported_audio_format");
    return false;
  }
  try {
    state.audioTimeline = new TwilioAudioTimeline(msg.start.tracks, () => {
      void closeTwilioStream(ws, state, 1011, "audio_stream_failed")
        .catch(() => log("error", "twilio audio stop failed", { streamSid: state.streamSid }));
    });
  } catch {
    await closeTwilioStream(ws, state, 1008, "unsupported_audio_tracks");
    return false;
  }

  state.phase = "streaming";
  state.streamSid = msg.start.streamSid ?? msg.streamSid;
  state.callSid = tokenCallSid;
  state.direction = direction;
  state.startTime = Date.now();

  return true;
}

async function startTwilioStream(ws: MediaStreamWebSocket, state: TwilioStreamState, msg: TwilioStartMessage) {
  if (!await prepareTwilioStream(ws, state, msg)) return;
  const direction = state.direction ?? "outbound";
  const stt = await openTwilioTranscription(ws, state, direction);

  // The message handler runs fire-and-forget, so a stop/close can be
  // processed while we were awaiting the config load and the STT open. If it
  // was, the stop handler already ran and saw no state.stt — so this stream
  // is orphaned. Close it here (never assigning it to state) instead of
  // leaking the upstream ElevenLabs connection. No billing: the stream
  // opened after the call ended, so no audio was transcribed.
  if (state.phase === "stopped") {
    if (stt) {
      stt.close();
      log("info", "twilio stream stopped during STT open; closed orphaned stream", {
        workspaceId: ws.data.workspaceId,
        callSid: state.callSid,
        streamSid: state.streamSid,
      });
    }
    return;
  }

  state.stt = stt;
  // The STT clock — not the coaching clock — is what live transcription is
  // billed on. Only set once the stream is actually open.
  state.sttOpenedAt = stt ? Date.now() : null;
  if (stt) {
    try { state.audioTimeline?.connect(audio => stt.send(audio)); }
    catch {
      await closeTwilioStream(ws, state, 1011, "audio_stream_failed");
      return;
    }
  } else {
    state.audioTimeline?.close();
    state.audioTimeline = null;
  }

  log("info", "twilio stream started", {
    workspaceId: ws.data.workspaceId,
    callSid: state.callSid,
    streamSid: state.streamSid,
    direction,
    sttEnabled: stt !== null,
    coachingEnabled: state.coaching != null,
  });
  return;
}

export async function handleTwilioStreamMessage(
  ws: MediaStreamWebSocket,
  msg: TwilioStreamMessage,
): Promise<void> {
  const state = getOrInitTwilioState(ws);

  switch (msg.event) {
    case "connected":
      return;

    case "start":
      return startTwilioStream(ws, state, msg);

    case "media": {
      if (state.phase !== "streaming" || !state.audioTimeline) return;
      try { state.audioTimeline.push(msg.media); }
      catch {
        await closeTwilioStream(ws, state, 1008, "invalid_audio_timeline");
      }
      return;
    }

    case "mark":
      return;

    case "stop": {
      return stopTwilioStream(ws, state, msg.code, msg.reason);
    }

    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}
