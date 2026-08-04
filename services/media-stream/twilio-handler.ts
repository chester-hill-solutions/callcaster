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
import type {
  ElevenLabsCommittedTranscriptMessage,
  ElevenLabsWord,
  MediaStreamWebSocket,
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
  const segment = await writeTranscriptSegment(segmentInput);
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

export async function handleTwilioStreamMessage(
  ws: MediaStreamWebSocket,
  msg: TwilioStreamMessage,
): Promise<void> {
  const state = getOrInitTwilioState(ws);

  switch (msg.event) {
    case "connected":
      return;

    case "start": {
      const params = msg.start.customParameters ?? {};
      const direction = params.direction ?? "outbound";

      state.phase = "streaming";
      state.streamSid = msg.start.streamSid ?? msg.streamSid;
      state.callSid = msg.start.callSid;
      state.direction = direction;
      state.startTime = Date.now();

      const workspaceConfig = await loadWorkspaceMediaStreamConfig(ws.data.workspaceId);
      if (workspaceConfig.capabilities.runCoaching && state.callSid) {
        state.coaching = createCoachingState({
          callSid: state.callSid,
          workspaceId: ws.data.workspaceId,
          direction,
          config: workspaceConfig.coachingConfig,
        });
      }

      const stt = await openElevenLabsRealtimeStream(ws.data.workspaceId, async (event) => {
        await handleCommittedTranscript(ws, state, event);
      });

      state.stt = stt;
      // The STT clock — not the coaching clock — is what live transcription is
      // billed on. Only set once the stream is actually open.
      state.sttOpenedAt = stt ? Date.now() : null;

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

    case "media": {
      if (state.phase !== "streaming" || !state.stt) return;
      const payload = msg.media.payload;
      if (!payload) return;
      const audio = Buffer.from(payload, "base64");
      state.stt.send(audio);
      return;
    }

    case "mark":
      return;

    case "stop": {
      if (state.stt) {
        state.stt.close();
        state.stt = null;
      }
      if (state.coaching) {
        await finalizeCoachingSession(state.coaching);
        state.coaching = null;
      }

      // Live transcription follows the STT lifecycle, not coaching: bill
      // whenever realtime STT actually opened, whether or not this workspace
      // runs coaching. Clearing sttOpenedAt first makes a repeated stop a
      // no-op on top of the key-level idempotency in the ledger.
      const sttOpenedAt = state.sttOpenedAt ?? null;
      state.sttOpenedAt = null;
      let transcriptionCredits = 0;
      if (sttOpenedAt !== null && state.callSid) {
        const result = await billLiveTranscription({
          workspaceId: ws.data.workspaceId,
          callSid: state.callSid,
          durationMs: Date.now() - sttOpenedAt,
        });
        transcriptionCredits = result.credits;
      }

      state.phase = "stopped";
      log("info", "twilio stream stopped", {
        workspaceId: ws.data.workspaceId,
        callSid: state.callSid,
        streamSid: state.streamSid,
        code: msg.code,
        reason: msg.reason,
        transcriptionCredits,
      });
      return;
    }

    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}
