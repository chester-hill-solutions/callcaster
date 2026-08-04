# Live Transcription + Live Coaching — Implementation Plan

**Status:** Plan complete. ADRs 0027-0030 written. Ready for v2 build phases 1, 4, 5, 6, 8.
**Scope:** Live in-call transcription (Deepgram Nova-3 streaming) + live coaching (rule-based metrics + Cohere Command A on 30s cadence) + post-call golden transcript (Cohere Transcribe batch via worker).
**Stack:** CallCaster v2 clean rebuild (Bun + Drizzle + pg-realtime SSE + Railway Buckets + Bun worker + Better Auth). Zero Supabase surfaces. See ADRs 0001-0010.

**Decisions locked (from investigation):**
- Stream direction: **unidirectional sidecar** — AI listens, never speaks (ADR-0027)
- STT split: **Deepgram Nova-3 live + Cohere Transcribe batch** — each where it wins (ADR-0027, ADR-0029)
- Agent meaning: **self-service metrics + LLM suggestions** — no autonomous AI coach in Phase 1 (ADR-0028)
- LLM for coaching: **Cohere Command A** via `cohere-ai` SDK (ADR-0028)
- Billing: **meter against `workspace.credits`** via idempotent ledger + Drizzle tx (ADR-0006)
- WS bridge: **media-stream Bun service as third Railway process** (ADR-0030)
- Build target: **v2 clean rebuild in `callcaster-v2/`** — not v1 (ADR-0008)
- Call modes: **all three** (manual outbound, predictive conference, inbound handset branch) (ADR-0027)

---

## Architecture

```
┌──────────┐  TwiML <Start><Stream track="both_tracks">  ┌────────────────────────┐
│  Twilio  │ ──────────── wss (mulaw 8kHz) ─────────────►│ media-stream service   │
│  Voice   │                                              │ (Bun, 3rd Railway svc) │
│  call    │                                              │  Bun.serve websocket   │
└──────────┘                                              └───────────┬────────────┘
       │                                                              │
       │ recordingStatusCallback                                      │ sendMedia (mulaw)
       ▼                                                              ▼
┌──────────────────┐                                  ┌──────────────────────────┐
│ /api/recording   │  (Bun route, ADR-0009)          │ Deepgram Nova-3 streaming│
│ download→Buckets │                                  │ diarize_model=latest     │
│→Drizzle update   │                                  │ filler_words=true        │
│ call.audioUrl    │                                  │ utterance_end_ms=1000    │
└────────┬─────────┘                                  │ vad_events=true          │
         │                                            │ encoding=mulaw 8kHz      │
         │ worker job: cohere_batch_transcribe        └──────────┬───────────────┘
         ▼ (every 15 min)                                        │ Results
┌──────────────────────┐                          ┌─────────────┴────────────┐
│ Bun worker           │  ← Railway Buckets audio │ coaching-engine:         │
│ job: cohere_batch    │    file                  │  Layer 1 (per utterance) │
│ Cohere Transcribe    │                          │   WPM, filler count,     │
│ → call_transcript    │                          │   pauses (rule-based)    │
│   provider=cohere_   │                          │  Layer 2 (30s cadence)   │
│     batch            │                          │   Cohere Command A cue   │
│ → credit debit       │                          │   {heading, suggestion}  │
└──────────────────────┘                          └─────────────┬────────────┘
                                                                │
                                  ┌─────────────────────────────┴──────────┐
                                  ▼                                         ▼
                        ┌──────────────────┐                  ┌─────────────────────┐
                        │ Drizzle inserts  │                  │ workspace_events    │
                        │ (admin client):  │                  │ insert + pg_notify  │
                        │ transcript_seg,  │                  │ (same transaction)  │
                        │ coaching_event,  │                  └─────────┬───────────┘
                        │ coaching_session │                            │
                        │ + credit debit   │                            │ LISTEN
                        │ (Drizzle tx,     │                            ▼
                        │  ADR-0006)       │                  ┌─────────────────────┐
                        └──────────────────┘                  │ SSE route           │
                                                              │ /events/workspace/  │
                                                              │ :workspaceId        │
                                                              │ (pg-realtime,       │
                                                              │  ADR-0005)          │
                                                              │ Last-Event-ID       │
                                                              │ cursor resume       │
                                                              └─────────┬───────────┘
                                                                        │ SSE stream
                                                                        ▼
                                                              ┌─────────────────────┐
                                                              │ Agent CallScreen UI │
                                                              │  Transcript panel   │
                                                              │  Coaching panel     │
                                                              │  useCallCoaching()  │
                                                              │  (EventSource +     │
                                                              │   cursor resume)    │
                                                              └─────────────────────┘
```

**Key insight:** pg-realtime SSE is *better* than the v1 Supabase Realtime broadcast for this use case. Transcript segments are unidirectional, event-shaped, and resume-valuable — exactly what ADR-0005 says SSE handles well. If the agent's connection drops, `Last-Event-ID` cursor resume means no lost transcript. v1 Supabase Realtime broadcasts were lost on reconnect.

---

## v2 build phases touched

This feature is cross-cutting. It slots into 5 of the 11 v2 build phases (ADR-0008):

| Phase | What this feature adds | Blocks? |
|---|---|---|
| **1. Schema** | 4 new Drizzle tables + 2 column additions to `call` + 2 column additions to `workspace` + new `workspace_events` type enum values + new `job.type` enum value | Include in initial MCP-aided schema generation |
| **4. Worker** | `cohere_batch_transcribe` job handler + worker scheduler entry (every 15 min) | Add during worker build |
| **5. Realtime** | Transcript/coaching event types in `workspace_events` + `useCallCoaching` SSE client hook | Add during pg-realtime build |
| **6. Twilio routes** | `<Start><Stream>` TwiML in all 3 call-mode routes + fixed `/api/recording` route (download → Railway Buckets → `call.audioUrl`) | Add during Twilio route port |
| **8. UI routes** | `CallScreen.Transcript` + `CallScreen.Coaching` panels + `useCallCoaching` hook + post-call call-detail view + ack endpoint | Add during call-screen rewrite |

Plus a **new infrastructure component**: the media-stream Bun service (third Railway service alongside web + worker).

---

## Stream 1 — Drizzle schema (v2 phase 1)

Added to `callcaster-v2/app/db/schema.ts` during MCP-aided schema generation. All tables use `call.id` (domain PK, ADR-0015) as the FK target, not `call.twilioSid`.

### New tables

```typescript
import { pgTable, uuid, integer, text, bigint, real, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { call, workspace } from './schema'; // existing v2 tables

// ─── Transcript segment ────────────────────────────────────────────────────
// One row per Deepgram speech_final utterance. Speaker 0 = agent, 1 = contact
// (Deepgram diarize_model=latest assigns speaker numbers; we map 0→agent
// because the agent's leg is the outbound track in manual/inbound, or the
// conference participant in predictive — the mapping is settled in the
// media-stream handler based on call direction + custom TwiML params).
export const transcriptSegment = pgTable('transcript_segment', {
  id: uuid('id').defaultRandom().primaryKey(),
  callId: integer('call_id').notNull().references(() => call.id),
  speaker: integer('speaker').notNull(),           // 0 = agent, 1 = contact
  speakerLabel: text('speaker_label'),             // 'agent' | 'contact'
  text: text('text').notNull(),
  startMs: bigint('start_ms', { mode: 'number' }).notNull(),
  endMs: bigint('end_ms', { mode: 'number' }).notNull(),
  confidence: real('confidence'),
  fillerCount: integer('filler_count').default(0),
  isFinal: boolean('is_final').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  callIdx: index('transcript_segment_call_idx').on(t.callId),
}));

// ─── Coaching event ────────────────────────────────────────────────────────
// One row per coaching signal: filler burst, pace drift, long pause, or an
// LLM-generated suggestion cue. ackedAt is set when the agent dismisses it.
export const CoachingEventPayload = z.object({
  // For 'filler_burst': { count, words: ['uh','um','uh'] }
  // For 'pace': { wpm, range: 'fast'|'slow' }
  // For 'pause': { durationMs, position: 'mid_sentence'|'end_sentence' }
  // For 'suggestion': { heading, suggestion }
  // For 'objection': { signal, snippet }
}).passthrough();

export const coachingEvent = pgTable('coaching_event', {
  id: uuid('id').defaultRandom().primaryKey(),
  callId: integer('call_id').notNull().references(() => call.id),
  type: text('type').notNull(),   // 'filler_burst' | 'pace' | 'pause' | 'suggestion' | 'objection'
  severity: text('severity'),     // 'info' | 'warn' | 'critical'
  payload: jsonb('payload').$type<z.infer<typeof CoachingEventPayload>>(),
  acknowledgedAt: timestamp('acknowledged_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  callIdx: index('coaching_event_call_idx').on(t.callId),
}));

// ─── Coaching session ──────────────────────────────────────────────────────
// One row per call, written on stream stop. The post-call summary shown in
// the call-detail view. Score is composite: 30% filler frequency, 25% pace
// adherence, 25% pause discipline, 20% silence ratio (FluentFlow weighting).
export const coachingSession = pgTable('coaching_session', {
  id: uuid('id').defaultRandom().primaryKey(),
  callId: integer('call_id').notNull().references(() => call.id).unique(),
  wpmAvg: integer('wpm_avg'),
  fillerCount: integer('filler_count'),
  pauseCount: integer('pause_count'),
  longPauseCount: integer('long_pause_count'),
  score: integer('score'),          // 0-100
  summary: text('summary'),         // LLM-generated on stream stop (Cohere Command A)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Call transcript ───────────────────────────────────────────────────────
// Allows both live (Deepgram) and batch (Cohere) transcripts per call.
// call.transcriptId points at the "golden" one — starts as the Deepgram live
// transcript, repointed to the Cohere batch transcript when the worker job
// completes (ADR-0029).
export const TranscriptMetadata = z.object({
  deepgramModel: z.string().optional(),
  cohereModel: z.string().optional(),
  utteranceCount: z.number().optional(),
  detectedLanguage: z.string().optional(),
}).passthrough();

export const callTranscript = pgTable('call_transcript', {
  id: uuid('id').defaultRandom().primaryKey(),
  callId: integer('call_id').notNull().references(() => call.id).unique(),
  provider: text('provider').notNull(),   // 'deepgram_live' | 'cohere_batch'
  language: text('language').default('en'),
  fullText: text('full_text'),
  wordCount: integer('word_count'),
  durationMs: bigint('duration_ms', { mode: 'number' }),
  metadata: jsonb('metadata').$type<z.infer<typeof TranscriptMetadata>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Alterations to existing v2 tables

```typescript
// call (pruned per ADR-0015) — add three columns:
//   audioUrl          text     — Railway Buckets path (distinct from recordingUrl
//                                which is the Twilio-hosted URL; audioUrl is our copy)
//   transcriptId      uuid FK → callTranscript.id  — the "golden" transcript
//   coachingSessionId uuid FK → coachingSession.id
//
// These are added to the call table definition in schema.ts during MCP-aided
// generation, NOT as a later migration — they're part of the initial v2 schema.

// workspace — add two typed jsonb columns:
const WorkspaceFeatureFlags = z.object({
  liveTranscription: z.boolean().default(false),
  liveCoaching: z.boolean().default(false),
  // ...other flags added as needed
});

const CoachingConfig = z.object({
  fillerWords: z.array(z.string()).default(['uh', 'um', 'like', 'you know', 'basically', 'actually']),
  wpmMin: z.number().default(120),
  wpmMax: z.number().default(160),
  pauseThresholdMs: z.number().default(1500),
  llmCadenceMs: z.number().default(30_000),
  llmPersona: z.string().default('encouraging sales coach'),
  disclosureEnabled: z.boolean().default(false),
});

// workspace.featureFlags: jsonb('feature_flags').$type<z.infer<typeof WorkspaceFeatureFlags>>()
// workspace.coachingConfig: jsonb('coaching_config').$type<z.infer<typeof CoachingConfig>>()
```

### `workspace_events` type enum additions (ADR-0005)

Add these to the `workspace_event_type` enum (or the `type` text column on `workspace_events`):

- `transcript_segment` — payload: `{ callId, segmentId, speaker, text, fillerCount }`
- `coaching_metrics` — payload: `{ callId, wpm, fillerCount, pauseCount, longPauseCount }`
- `coaching_cue` — payload: `{ callId, eventId, heading, suggestion, severity }`
- `coaching_session_final` — payload: `{ callId, sessionId, wpmAvg, fillerCount, score, summary }`

### `job.type` enum addition (ADR-0007)

Add `'cohere_batch_transcribe'` to the job type enum.

### Feature-flag helper

`callcaster-v2/app/lib/feature-flags.ts`:

```typescript
import type { WorkspaceFeatureFlags } from '../db/schema';

export function hasFeatureFlag(
  flags: WorkspaceFeatureFlags | null | undefined,
  flag: keyof WorkspaceFeatureFlags,
): boolean {
  return Boolean(flags?.[flag]);
}

export function coachingEnabled(flags?: WorkspaceFeatureFlags | null): boolean {
  return hasFeatureFlag(flags, 'liveTranscription') || hasFeatureFlag(flags, 'liveCoaching');
}
```

---

## Stream 2 — Media-stream Bun service (new, ~phase 4.5)

Third Railway service (web + worker + **media-stream**), same codebase, different entry point. Consistent with ADR-0001 (Bun single runtime) and ADR-0007 (worker is same binary, different CMD).

### Directory layout

```
callcaster-v2/
├── src/
│   ├── web/                    # Bun.serve + React Router (entry: src/web/index.ts)
│   ├── worker/                 # Bun job-processor (entry: src/worker/index.ts)
│   └── media-stream/           # NEW: Twilio Media Streams bridge (entry: src/media-stream/index.ts)
│       ├── index.ts            # Bun.serve({ port: 8081, websocket, fetch })
│       ├── twilio-handler.ts   # Parse connected/start/media/stop; decode base64 mulaw; forward to Deepgram
│       ├── deepgram-client.ts  # Open Deepgram Nova-3 streaming WS; KeepAlive; emit typed Results
│       ├── coaching-engine.ts  # Layer 1 (rule-based metrics) + Layer 2 (Cohere Command A cadence)
│       ├── db-writer.ts        # Drizzle admin client: insert segments/events/sessions + workspace_events + pg_notify + credit debit
│       └── types.ts            # Shared types: TwilioStreamMessage, DeepgramResult, CoachingState
├── shared/
│   └── billing-rates.ts        # NEW: TRANSCRIPTION_RATE_CREDITS, COACHING_CUE_CREDITS, TRANSCRIPTION_BATCH_CREDITS
├── Dockerfile                  # multi-stage; CMD depends on RAILWAY_SERVICE_TYPE env
├── railway.web.toml
├── railway.worker.toml
└── railway.media-stream.toml   # NEW
```

### `src/media-stream/index.ts` — Bun.serve with native WS

```typescript
import { twilioStreamHandler } from './twilio-handler';

const PORT = Number(process.env.PORT ?? 8081);

Bun.serve({
  port: PORT,
  websocket: {
    open(ws) {
      ws.data = { ...ws.data, state: 'connected' };
    },
    async message(ws, msg) {
      // Twilio sends JSON messages as Text frames
      const text = typeof msg === 'string' ? msg : new TextDecoder().decode(msg as Buffer);
      await twilioStreamHandler(ws, JSON.parse(text));
    },
    async close(ws, code, reason) {
      await twilioStreamHandler(ws, { event: 'stop', code, reason: String(reason) });
    },
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/media-stream' && req.headers.get('upgrade') === 'websocket') {
      server.upgrade(req, {
        data: { state: 'init', callId: null, workspaceId: null },
      });
      return;
    }
    if (url.pathname === '/healthz') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },
});

console.log(JSON.stringify({ level: 'info', message: 'media-stream service listening', port: PORT }));
```

### `src/media-stream/twilio-handler.ts` — Twilio protocol

Handles the Twilio Media Streams message sequence:

1. **`connected`** — Twilio ACK; no-op.
2. **`start`** — extract `streamSid`, `callSid`, and custom `<Parameter>` values (`callId`, `workspaceId`, `userId`, `contactId`, `campaignId`, `direction`). Open Deepgram streaming WS. Initialize `CoachingState`.
3. **`media`** — decode `payload` (base64 mulaw 8kHz) → `Buffer` → forward to Deepgram via `ws.send(buffer)` (binary). ~50 messages/sec per direction.
4. **`stop`** — close Deepgram WS, finalize `coaching_session` row, debit transcription credits, clean up state.

```typescript
import type { ServerWebSocket } from 'bun';
import { openDeepgramStream, type DeepgramResult } from './deepgram-client';
import { processUtterance, finalizeSession, type CoachingState } from './coaching-engine';
import { writeTranscriptSegment, writeCoachingEvent, writeCoachingSessionFinal, insertWorkspaceEvent, debitTranscriptionCredits } from './db-writer';

interface TwilioStartMessage {
  event: 'connected' | 'start' | 'media' | 'stop';
  // connected
  payload?: string;           // base64 mulaw for media events
  // start
  streamSid?: string;
  callSid?: string;
  start?: { customParameters?: Record<string, string> };
  // stop
  code?: number;
  reason?: string;
}

export async function twilioStreamHandler(ws: ServerWebSocket<any>, msg: TwilioStartMessage) {
  switch (msg.event) {
    case 'connected':
      return;

    case 'start': {
      const params = msg.start?.customParameters ?? {};
      const callId = Number(params.callId);
      const workspaceId = params.workspaceId;
      const userId = params.userId;
      const direction = params.direction ?? 'outbound';

      ws.data = {
        ...ws.data,
        state: 'streaming',
        callId,
        workspaceId,
        userId,
        direction,
        streamSid: msg.streamSid,
        callSid: msg.callSid,
        startTime: Date.now(),
      };

      const deepgram = await openDeepgramStream(workspaceId, async (result: DeepgramResult) => {
        await handleDeepgramResult(ws.data, result);
      });

      ws.data.deepgram = deepgram;
      return;
    }

    case 'media': {
      if (!msg.payload || !ws.data.deepgram) return;
      const audio = Buffer.from(msg.payload, 'base64');
      ws.data.deepgram.send(audio);
      return;
    }

    case 'stop': {
      if (ws.data.deepgram) {
        ws.data.deepgram.close();
      }
      await finalizeSession(ws.data);
      await debitTranscriptionCredits(ws.data);
      return;
    }
  }
}

async function handleDeepgramResult(state: any, result: DeepgramResult) {
  if (!result.channel?.alternatives?.[0]?.transcript) return;
  const alt = result.channel.alternatives[0];

  if (result.speech_final) {
    // Complete utterance — persist segment + run coaching engine Layer 1
    const speaker = alt.words?.[0]?.speaker ?? 0;
    const speakerLabel = speaker === 0 ? 'agent' : 'contact';
    const fillerCount = countFillers(alt.words, state.workspaceId);
    const segment = {
      callId: state.callId,
      speaker,
      speakerLabel,
      text: alt.transcript,
      startMs: Math.round((alt.words?.[0]?.start ?? 0) * 1000),
      endMs: Math.round((alt.words?.[alt.words.length - 1]?.end ?? 0) * 1000),
      confidence: alt.confidence,
      fillerCount,
      isFinal: true,
    };

    await writeTranscriptSegment(segment);
    await insertWorkspaceEvent(state.workspaceId, 'transcript_segment', { callId: state.callId, ...segment });

    await processUtterance(state, segment);  // coaching-engine Layer 1 + maybe Layer 2
  }
}
```

### `src/media-stream/deepgram-client.ts` — Nova-3 streaming

```typescript
import { CoachingConfig } from '../db/schema';

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen';

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramResult {
  type: 'Results' | 'Metadata' | 'UtteranceEnd';
  speech_final?: boolean;
  is_final?: boolean;
  channel?: { alternatives: DeepgramAlternative[] };
  start?: number;
  duration?: number;
}

export interface DeepgramStream {
  send: (audio: Buffer) => void;
  close: () => void;
}

export async function openDeepgramStream(
  workspaceId: string,
  onResult: (result: DeepgramResult) => Promise<void>,
): Promise<DeepgramStream> {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    smart_format: 'true',
    diarize_model: 'latest',
    filler_words: 'true',
    punctuate: 'true',
    utterances: 'true',
    utterance_end_ms: '1000',
    vad_events: 'true',
    encoding: 'mulaw',
    sample_rate: '8000',
    channels: '1',
  });

  const ws = new WebSocket(`${DEEPGRAM_URL}?${params.toString()}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  // KeepAlive every 5s — Deepgram closes idle connections
  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, 5000);

  ws.addEventListener('message', async (event) => {
    try {
      const data: DeepgramResult = JSON.parse(event.data);
      await onResult(data);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', message: 'deepgram parse error', err: String(err) }));
    }
  });

  ws.addEventListener('close', () => clearInterval(keepalive));

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', reject);
  });

  return {
    send: (audio: Buffer) => ws.send(audio),
    close: () => {
      clearInterval(keepalive);
      ws.close();
    },
  };
}
```

### `src/media-stream/coaching-engine.ts` — Layer 1 + Layer 2

```typescript
import { CohereClient } from 'cohere-ai';
import { writeCoachingEvent, insertWorkspaceEvent } from './db-writer';
import type { CoachingConfig, TranscriptSegment } from '../db/schema';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

interface CoachingState {
  callId: number;
  workspaceId: string;
  direction: string;
  startTime: number;
  config: CoachingConfig;
  segments: TranscriptSegment[];
  wpmWindow: { words: number; ms: number };
  fillerTotal: number;
  pauseTotal: number;
  longPauseTotal: number;
  lastUtteranceEnd: number;
  lastCueAt: number;
}

// Layer 1: rule-based metrics, runs on every speech_final utterance
export async function processUtterance(state: CoachingState, segment: TranscriptSegment) {
  state.segments.push(segment);

  // WPM (30s rolling window)
  const durationMs = segment.endMs - segment.startMs;
  const wordCount = segment.text.split(/\s+/).filter(Boolean).length;
  state.wpmWindow.words += wordCount;
  state.wpmWindow.ms += durationMs;
  // Trim window to last 30s
  // (simplified — full implementation trims by timestamp)
  const wpm = state.wpmWindow.ms > 0 ? Math.round((state.wpmWindow.words / state.wpmWindow.ms) * 60_000) : 0;

  // Filler burst detection
  if (segment.fillerCount >= 3) {
    await emitCoachingEvent(state, {
      type: 'filler_burst',
      severity: 'warn',
      payload: { count: segment.fillerCount, words: extractFillers(segment.text, state.config.fillerWords) },
    });
  }

  // Pace drift (3 consecutive utterances outside range)
  // (simplified — full implementation tracks consecutive-out-of-range count)
  if (wpm > 0 && (wpm < state.config.wpmMin || wpm > state.config.wpmMax)) {
    await emitCoachingEvent(state, {
      type: 'pace',
      severity: 'info',
      payload: { wpm, range: wpm < state.config.wpmMin ? 'slow' : 'fast' },
    });
  }

  // Pause detection (gap between utterances)
  if (state.lastUtteranceEnd > 0) {
    const gapMs = segment.startMs - state.lastUtteranceEnd;
    if (gapMs > state.config.pauseThresholdMs) {
      const isLong = gapMs > state.config.pauseThresholdMs * 2;
      state.longPauseTotal += isLong ? 1 : 0;
      state.pauseTotal += 1;
      await emitCoachingEvent(state, {
        type: 'pause',
        severity: isLong ? 'warn' : 'info',
        payload: { durationMs: gapMs, position: 'between_utterances' },
      });
    }
  }
  state.lastUtteranceEnd = segment.endMs;

  // Push metrics event (instant UI update)
  await insertWorkspaceEvent(state.workspaceId, 'coaching_metrics', {
    callId: state.callId,
    wpm,
    fillerCount: state.fillerTotal + segment.fillerCount,
    pauseCount: state.pauseTotal,
    longPauseCount: state.longPauseTotal,
  });
  state.fillerTotal += segment.fillerCount;

  // Layer 2: LLM cadence
  const now = Date.now();
  if (now - state.lastCueAt >= state.config.llmCadenceMs) {
    await generateLlmCue(state);
    state.lastCueAt = now;
  }
}

async function generateLlmCue(state: CoachingState) {
  const recent = state.segments.slice(-10);
  const transcript = recent
    .map((s) => `${s.speakerLabel}: ${s.text}`)
    .join('\n');

  const prompt = `You are an ${state.config.llmPersona}. Based on the last 10 utterances of a live phone call, give ONE concise coaching cue for the agent. Format: a 2-word heading and a one-sentence suggestion.

Transcript:
${transcript}

Respond as JSON: {"heading": "...", "suggestion": "..."}`;

  try {
    const response = await cohere.generate({
      model: 'command-a-03-2025',
      prompt,
      maxTokens: 100,
      temperature: 0.7,
      responseFormat: 'json',
    });

    const cue = JSON.parse(response.generations[0].text);
    await emitCoachingEvent(state, {
      type: 'suggestion',
      severity: 'info',
      payload: { heading: cue.heading, suggestion: cue.suggestion },
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'cohere cue failed', err: String(err) }));
  }
}

async function emitCoachingEvent(state: CoachingState, event: {
  type: string;
  severity: string;
  payload: Record<string, unknown>;
}) {
  await writeCoachingEvent(state.callId, event);
  await insertWorkspaceEvent(state.workspaceId, 'coaching_cue', {
    callId: state.callId,
    ...event,
  });
}

// On stream stop — finalize the session + generate summary
export async function finalizeSession(state: CoachingState) {
  const wpmAvg = state.wpmWindow.ms > 0
    ? Math.round((state.wpmWindow.words / state.wpmWindow.ms) * 60_000)
    : 0;

  // Generate summary with Cohere
  let summary = '';
  try {
    const fullTranscript = state.segments.map((s) => `${s.speakerLabel}: ${s.text}`).join('\n');
    const response = await cohere.generate({
      model: 'command-a-03-2025',
      prompt: `Summarize this call in 2-3 sentences, focusing on the agent's communication strengths and one area for improvement:\n\n${fullTranscript}`,
      maxTokens: 150,
      temperature: 0.5,
    });
    summary = response.generations[0].text;
  } catch { /* non-fatal */ }

  // Score: 30% filler, 25% pace, 25% pause, 20% silence
  const score = computeScore(state);

  await writeCoachingSessionFinal({
    callId: state.callId,
    wpmAvg,
    fillerCount: state.fillerTotal,
    pauseCount: state.pauseTotal,
    longPauseCount: state.longPauseTotal,
    score,
    summary,
  });

  await insertWorkspaceEvent(state.workspaceId, 'coaching_session_final', {
    callId: state.callId,
    wpmAvg,
    fillerCount: state.fillerTotal,
    score,
    summary,
  });
}

function computeScore(state: CoachingState): number {
  // 30% filler frequency (lower = better)
  // 25% pace adherence (in range = 100)
  // 25% pause discipline (fewer long pauses = better)
  // 20% silence ratio (not yet tracked — placeholder)
  // ...full implementation
  return 75; // placeholder
}
```

### `src/media-stream/db-writer.ts` — Drizzle admin client + pg_notify + billing

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { transcriptSegment, coachingEvent, coachingSession, workspaceEvents, transactionHistory, workspace } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { TRANSCRIPTION_RATE_CREDITS, COACHING_CUE_CREDITS } from '../../shared/billing-rates';

// Admin client — cross-workspace (like the worker). Not the scoped createTenantDb.
const queryClient = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(queryClient);

export async function writeTranscriptSegment(segment: typeof transcriptSegment.$inferInsert) {
  await db.insert(transcriptSegment).values(segment);
}

export async function writeCoachingEvent(callId: number, event: {
  type: string;
  severity: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(coachingEvent).values({ callId, ...event });
}

export async function writeCoachingSessionFinal(session: typeof coachingSession.$inferInsert) {
  await db.insert(coachingSession).values(session)
    .onConflictDoUpdate({
      target: coachingSession.callId,
      set: session,
    });
}

// Insert workspace_event + pg_notify in the same transaction (ADR-0005)
export async function insertWorkspaceEvent(
  workspaceId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await db.transaction(async (tx) => {
    const [event] = await tx.insert(workspaceEvents).values({
      workspaceId,
      type,
      payload,
    }).returning({ id: workspaceEvents.id });

    // NOTIFY wakes the SSE listener (ADR-0005)
    await tx.execute(sql`select pg_notify('workspace_event', ${String(event.id)})`);
  });
}

// ADR-0006: Drizzle tx, no DB triggers
// Idempotent ledger insert + credits update gated on `inserted`
export async function debitTranscriptionCredits(state: {
  callId: number;
  workspaceId: string;
  startTime: number;
}) {
  const minutes = (Date.now() - state.startTime) / 60_000;
  const amount = -Math.ceil(minutes * TRANSCRIPTION_RATE_CREDITS);
  const idempotencyKey = `transcription:${state.callId}`;

  await db.transaction(async (tx) => {
    const inserted = await tx.insert(transactionHistory).values({
      workspaceId: state.workspaceId,
      amount,
      type: 'transcription',
      idempotencyKey,
    }).onConflictDoNothing({ target: transactionHistory.idempotencyKey })
      .returning({ id: transactionHistory.id });

    if (inserted.length > 0) {
      await tx.update(workspace)
        .set({ credits: sql`${workspace.credits} + ${amount}` })
        .where(sql`${workspace.id} = ${state.workspaceId} FOR UPDATE`);
    }
  });
}
```

### `shared/billing-rates.ts` — shared constants

```typescript
// Deepgram Nova-3 streaming: ~$0.0043/min. At 1 credit = $0.01, that's 0.43 credits/min.
export const TRANSCRIPTION_RATE_CREDITS = 0.43;

// Cohere Command A coaching cue: ~$0.0001/cue. Round to 0.1 credits.
export const COACHING_CUE_CREDITS = 0.1;

// Cohere Transcribe batch: ~$0.005/call. Round to 1 credit.
export const TRANSCRIPTION_BATCH_CREDITS = 1;
```

### `Dockerfile` — multi-stage with service type

The same Docker image runs all three services; `RAILWAY_SERVICE_TYPE` env var selects the entry point:

```dockerfile
FROM oven/bun:1.2 AS base
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run build

FROM oven/bun:1.2 AS runtime
WORKDIR /app
COPY --from=base /app /app
ENV PORT=3000
EXPOSE 3000
# CMD set by railway.*.toml per service
CMD ["bun", "run", "src/web/index.ts"]
```

### `railway.media-stream.toml`

```toml
[deploy]
startCommand = "RAILWAY_SERVICE_TYPE=media-stream bun run src/media-stream/index.ts"
healthcheckPath = "/healthz"
healthcheckTimeout = 30

[env]
PORT = "8081"
DEEPGRAM_API_KEY = { ref = "DEEPGRAM_API_KEY" }
COHERE_API_KEY = { ref = "COHERE_API_KEY" }
DATABASE_URL = { ref = "DATABASE_URL" }
```

### Env vars (media-stream service)

- `DEEPGRAM_API_KEY` — Deepgram API key
- `COHERE_API_KEY` — Cohere API key (covers both Command A + Transcribe)
- `DATABASE_URL` — Postgres connection string (same DB as web + worker)
- `PORT` — `8081`
- `S3_*` — Railway Buckets credentials (for any direct audio access; mostly the worker reads audio)

### Dependencies (new, v2)

| Package | Used by | Purpose |
|---|---|---|
| `@deepgram/sdk` | media-stream | Nova-3 streaming client (or use raw `WebSocket` — SDK is optional) |
| `cohere-ai` | media-stream + worker | Command A (coaching LLM) + Transcribe (batch) — single dep covers both |
| `drizzle-orm` | media-stream | Admin client for DB writes |
| `postgres` | media-stream | Postgres driver |

**No `ws`** — Bun has native WebSocket. **No `openai`** — clean deps, using Cohere.

---

## Stream 3 — TwiML wiring in Bun routes (v2 phase 6)

Per ADR-0009, all Twilio webhooks are Bun routes. Per ADR-0015, TwiML custom params carry `callId` (domain ID), not `callSid`. The `<Start><Stream>` element is **non-blocking** in TwiML — Twilio forks audio then continues to the next verb — so it cleanly precedes `<Dial>`/`<Conference>` in every call-mode route.

### Manual outbound — `callcaster-v2/app/routes/api+/call.action.ts`

```typescript
import { Twilio } from 'twilio';
import { createTenantDb, requireWorkspaceAccess } from '../lib/db';
import { hasFeatureFlag } from '../lib/feature-flags';

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const toNumber = formData.get('To') as string;
  const workspaceId = formData.get('workspace_id') as string;
  const clientIdentity = formData.get('client_identity') as string;
  const callId = formData.get('call_id') as string;  // pre-created call row

  const db = createTenantDb(workspaceId);
  const workspace = await db.query.workspace.findFirst();
  const flags = workspace?.featureFlags;

  const twiml = new Twilio.twiml.VoiceResponse();

  // Gate: only add <Stream> if live transcription is enabled
  if (hasFeatureFlag(flags, 'liveTranscription')) {
    // Optional compliance disclosure
    if (workspace?.coachingConfig?.disclosureEnabled) {
      twiml.say('This call may be analyzed by AI for quality purposes.');
    }

    const start = twiml.start();
    const stream = start.stream({
      url: `${process.env.MEDIA_STREAM_URL}/media-stream`,
      track: 'both_tracks',
      name: `call-${callId}`,
    });
    stream.parameter({ name: 'callId', value: callId });
    stream.parameter({ name: 'workspaceId', value: workspaceId });
    stream.parameter({ name: 'userId', value: formData.get('user_id') as string });
    stream.parameter({ name: 'contactId', value: formData.get('contact_id') as string });
    stream.parameter({ name: 'direction', value: 'outbound' });
  }

  // Existing <Dial> (or <Conference> if v2 unifies on ADR-0012)
  const dial = twiml.dial({
    callerId: workspace?.callerId,
    record: 'record-from-answer',
    recordingStatusCallback: `${process.env.BASE_URL}/api/recording`,
    recordingStatusCallbackEvent: ['completed'],
  });
  dial.number({
    machineDetection: 'Enable',
    amdStatusCallback: `${process.env.BASE_URL}/api/dial/status`,
    statusCallback: `${process.env.BASE_URL}/api/call-status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  }, toNumber);

  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}
```

### Predictive conference — `callcaster-v2/app/routes/api+/auto-dial/$roomId.action.ts`

Stream the **agent leg** (the `<Client>` softphone leg) with `track="both_tracks"`:
- `outbound_track` = agent mic (what the agent says)
- `inbound_track` = what the agent hears (the contact, bridged via conference)

One stream, one Deepgram connection, diarization separates speakers.

```typescript
// ...after conference creation, when adding the agent <Client>:
if (hasFeatureFlag(workspace.featureFlags, 'liveTranscription')) {
  const start = twiml.start();
  const stream = start.stream({
    url: `${process.env.MEDIA_STREAM_URL}/media-stream`,
    track: 'both_tracks',
    name: `conf-${conferenceName}`,
  });
  stream.parameter({ name: 'callId', value: String(callId) });
  stream.parameter({ name: 'workspaceId', value: workspaceId });
  stream.parameter({ name: 'direction', value: 'predictive' });
}

// Then the existing <Dial><Conference> or <Dial><Client>
```

### Inbound (handset branch only) — `callcaster-v2/app/routes/api+/inbound.action.ts`

Only the branch that `<Dial><Client>`s to a browser agent. **Not** IVR/queue/forward/voicemail branches.

```typescript
// In the handset branch:
if (hasFeatureFlag(workspace.featureFlags, 'liveTranscription')) {
  const start = twiml.start();
  const stream = start.stream({
    url: `${process.env.MEDIA_STREAM_URL}/media-stream`,
    track: 'both_tracks',
    name: `inbound-${callId}`,
  });
  stream.parameter({ name: 'callId', value: String(callId) });
  stream.parameter({ name: 'workspaceId', value: workspaceId });
  stream.parameter({ name: 'direction', value: 'inbound' });
}

// Then the existing <Dial><Client>
```

### Recording webhook fix — `callcaster-v2/app/routes/api+/recording.action.ts`

**Hard prerequisite** for Cohere post-call batch (ADR-0029). v1's `/api/recording` was a stub that validated the Twilio signature and logged but never downloaded the recording or wrote `call.recording_url`/`sid`/`duration`.

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createTenantDb } from '../lib/db';
import { validateWorkspaceTwilioWebhook } from '../lib/twilio-webhook';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callId = Number(params.callId);
  const recordingUrl = params.RecordingUrl;
  const recordingSid = params.RecordingSid;
  const recordingDuration = Number(params.RecordingDuration);

  // Validate Twilio signature (ADR-0011 per-workspace)
  const validation = await validateWorkspaceTwilioWebhook({ request, params });
  if (!validation.ok) return validation.response;

  // Download recording from Twilio
  const audioResponse = await fetch(`${recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${btoa(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`)}` },
  });
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

  // Upload to Railway Buckets
  const key = `${validation.workspaceId}/recording-${callId}.mp3`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  }));

  // Update call row via Drizzle
  const db = createTenantDb(validation.workspaceId);
  await db.update(call)
    .set({
      recordingUrl,
      recordingSid,
      recordingDuration,
      audioUrl: key,   // Railway Buckets path — the one Cohere batch reads
    })
    .where(eq(call.id, callId));

  return new Response('OK', { status: 200 });
}
```

---

## Stream 4 — Bun worker: Cohere batch transcription (v2 phase 4)

Per ADR-0007, all background work is a Bun worker + job table with HTTP wake + missed-cron catch-up.

### Job handler — `callcaster-v2/app/server/job-handlers/cohere-batch-transcribe.ts`

```typescript
import { z } from 'zod';
import { CohereClient } from 'cohere-ai';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { spawn } from 'bun';
import { db } from '../db';
import { call, callTranscript, transactionHistory, workspace } from '../../db/schema';
import { eq, sql, and, isNull, gt } from 'drizzle-orm';
import { TRANSCRIPTION_BATCH_CREDITS } from '../../../shared/billing-rates';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });
const s3 = new S3Client({ /* ...same as recording route */ });

const Params = z.object({ callId: z.number() });

export const cohereBatchTranscribeHandler = {
  type: 'cohere_batch_transcribe',
  paramsSchema: Params,
  async handle({ callId }: z.infer<typeof Params>) {
    // 1. Fetch the call row
    const [callRow] = await db.select().from(call).where(eq(call.id, callId));
    if (!callRow?.audioUrl) return { status: 'skipped', reason: 'no_audio_url' };

    // 2. Download from Railway Buckets
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: callRow.audioUrl,
    }));
    let audioBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

    // 3. Chunk with ffmpeg if > 25MB (Cohere limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      audioBuffer = await chunkWithFfmpeg(audioBuffer);
    }

    // 4. Call Cohere Transcribe
    const formData = new FormData();
    formData.append('model', 'cohere-transcribe-03-2026');
    formData.append('language', callRow.workspace?.coachingConfig?.language ?? 'en');
    formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), `recording-${callId}.mp3`);

    const response = await fetch('https://api.cohere.com/v2/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
      body: formData,
    });

    const { text } = await response.json() as { text: string };

    // 5. Insert call_transcript (provider='cohere_batch')
    const [transcript] = await db.insert(callTranscript).values({
      callId,
      provider: 'cohere_batch',
      language: 'en',
      fullText: text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      durationMs: callRow.recordingDuration ? callRow.recordingDuration * 1000 : null,
      metadata: { cohereModel: 'cohere-transcribe-03-2026' },
    }).returning({ id: callTranscript.id });

    // 6. Repoint call.transcriptId to the golden Cohere transcript
    await db.update(call).set({ transcriptId: transcript.id }).where(eq(call.id, callId));

    // 7. Debit credits (ADR-0006)
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(transactionHistory).values({
        workspaceId: callRow.workspaceId,
        amount: -TRANSCRIPTION_BATCH_CREDITS,
        type: 'transcription_batch',
        idempotencyKey: `transcription_batch:${callId}`,
      }).onConflictDoNothing({ target: transactionHistory.idempotencyKey })
        .returning({ id: transactionHistory.id });

      if (inserted.length > 0) {
        await tx.update(workspace)
          .set({ credits: sql`${workspace.credits} + ${-TRANSCRIPTION_BATCH_CREDITS}` })
          .where(sql`${workspace.id} = ${callRow.workspaceId} FOR UPDATE`);
      }
    });

    return { status: 'completed', transcriptId: transcript.id };
  },
};

async function chunkWithFfmpeg(audio: Buffer): Promise<Buffer> {
  // Use ffmpeg to split/concatenate if > 25MB. For now, transcode to lower bitrate.
  const proc = spawn(['ffmpeg', '-i', 'pipe:0', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], {
    stdin: 'pipe',
    stdout: 'pipe',
  });
  proc.stdin.write(audio);
  proc.stdin.end();
  const output = await new Response(proc.stdout).arrayBuffer();
  return Buffer.from(output);
}
```

### Scheduler entry — `callcaster-v2/app/server/job-scheduler.ts`

```typescript
// Every 15 minutes, enqueue cohere_batch_transcribe for eligible calls
export const cohereBatchTranscribeSchedule = {
  intervalMs: 15 * 60 * 1000,
  async tick() {
    const eligible = await db.select({ id: call.id, workspaceId: call.workspaceId })
      .from(call)
      .where(and(
        isNotNull(call.audioUrl),
        isNull(call.transcriptId),
        gt(call.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ));

    for (const row of eligible) {
      await enqueueJob({
        type: 'cohere_batch_transcribe',
        workspaceId: row.workspaceId,
        params: { callId: row.id },
        idempotencyKey: `cohere_batch:${row.id}`,
      });
    }
  },
};
```

### Worker Dockerfile — ffmpeg required

The worker Docker image must install `ffmpeg` (same as v1's production image per AGENTS.md). Add to `Dockerfile.worker`:

```dockerfile
FROM oven/bun:1.2 AS runtime
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=base /app /app
CMD ["bun", "run", "src/worker/index.ts"]
```

---

## Stream 5 — pg-realtime: transcript + coaching events (v2 phase 5)

Per ADR-0005, all realtime is SSE + `workspace_events` + LISTEN/NOTIFY with cursor resume via `Last-Event-ID`.

### Event types in `workspace_events`

| `type` | `payload` shape | Emitted by | Consumed by |
|---|---|---|---|
| `transcript_segment` | `{ callId, segmentId, speaker, speakerLabel, text, fillerCount }` | media-stream service | `useCallCoaching` hook → Transcript panel |
| `coaching_metrics` | `{ callId, wpm, fillerCount, pauseCount, longPauseCount }` | media-stream service | `useCallCoaching` hook → Coaching panel (WPM gauge, counters) |
| `coaching_cue` | `{ callId, eventId, type, severity, heading, suggestion }` | media-stream service | `useCallCoaching` hook → Coaching panel (cue card) |
| `coaching_session_final` | `{ callId, sessionId, wpmAvg, fillerCount, score, summary }` | media-stream service | `useCallCoaching` hook → final summary, post-call view |

### SSE route — `callcaster-v2/app/routes/api+/events/workspace.$workspaceId.sse.ts`

Per ADR-0005, the SSE route is **outside the `_auth` layout** (streaming Response breaks body writes inside layout middleware). Auth via session cookie or token query param.

```typescript
import { subscribeWorkspaceEvents } from '../server/workspace-events-listen';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId as string;
  const lastEventId = request.headers.get('Last-Event-ID');

  // Auth: verify session cookie or ?token= query param
  const userId = await verifySessionOrToken(request);
  await requireWorkspaceAccess({ userId, workspaceId });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const unsubscribe = await subscribeWorkspaceEvents({
        workspaceId,
        sinceId: lastEventId ? Number(lastEventId) : 0,
        onEvent(event) {
          const data = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
      });

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // disable proxy buffering
    },
  });
}
```

### `useCallCoaching` hook — `callcaster-v2/app/hooks/call/useCallCoaching.ts`

Wraps `@chs/pg-realtime`'s `useWorkspaceEvents` with call-specific filtering. Uses browser-native `EventSource` with automatic cursor resume.

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useWorkspaceEvents } from '@chester-hill-solutions/pg-realtime';

interface TranscriptSegment {
  id: string;
  speaker: number;
  speakerLabel: string;
  text: string;
  startMs: number;
  endMs: number;
  fillerCount: number;
}

interface CoachingMetrics {
  wpm: number;
  fillerCount: number;
  pauseCount: number;
  longPauseCount: number;
}

interface CoachingCue {
  eventId: string;
  type: string;
  severity: string;
  heading: string;
  suggestion: string;
  acknowledgedAt?: string;
}

interface CoachingSession {
  wpmAvg: number;
  fillerCount: number;
  pauseCount: number;
  longPauseCount: number;
  score: number;
  summary: string;
}

export function useCallCoaching(workspaceId: string, callId: number | null) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [metrics, setMetrics] = useState<CoachingMetrics | null>(null);
  const [cues, setCues] = useState<CoachingCue[]>([]);
  const [session, setSession] = useState<CoachingSession | null>(null);

  const handleEvent = useCallback((type: string, payload: any) => {
    if (payload.callId !== callId) return;  // filter to this call

    switch (type) {
      case 'transcript_segment':
        setSegments((prev) => [...prev, {
          id: payload.segmentId,
          speaker: payload.speaker,
          speakerLabel: payload.speakerLabel,
          text: payload.text,
          startMs: payload.startMs,
          endMs: payload.endMs,
          fillerCount: payload.fillerCount,
        }]);
        break;
      case 'coaching_metrics':
        setMetrics({
          wpm: payload.wpm,
          fillerCount: payload.fillerCount,
          pauseCount: payload.pauseCount,
          longPauseCount: payload.longPauseCount,
        });
        break;
      case 'coaching_cue':
        setCues((prev) => [...prev, {
          eventId: payload.eventId,
          type: payload.type,
          severity: payload.severity,
          heading: payload.heading,
          suggestion: payload.suggestion,
        }]);
        break;
      case 'coaching_session_final':
        setSession({
          wpmAvg: payload.wpmAvg,
          fillerCount: payload.fillerCount,
          pauseCount: payload.pauseCount,
          longPauseCount: payload.longPauseCount,
          score: payload.score,
          summary: payload.summary,
        });
        break;
    }
  }, [callId]);

  // useWorkspaceEvents handles EventSource connection, cursor resume via
  // Last-Event-ID, reconnect with backoff. @chs/pg-realtime (ADR-0005).
  useWorkspaceEvents({ workspaceId, onEvent: handleEvent });

  const acknowledgeCue = useCallback(async (eventId: string) => {
    await fetch('/api/coaching-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachingEventId: eventId }),
    });
    setCues((prev) => prev.map((c) => c.eventId === eventId ? { ...c, acknowledgedAt: new Date().toISOString() } : c));
  }, []);

  return { segments, metrics, cues, session, acknowledgeCue };
}
```

---

## Stream 6 — UI (v2 phase 8)

v2 rewrites all UI routes. The call screen + 17 softphone hooks are rewritten (ADR-0024). Transcript + coaching panels are new v2 components built alongside the rewritten call screen.

### `CallScreen.Transcript.tsx` — live transcript panel

```typescript
import { useCallCoaching } from '../../hooks/call/useCallCoaching';

export function CallScreenTranscript({ workspaceId, callId }: { workspaceId: string; callId: number | null }) {
  const { segments } = useCallCoaching(workspaceId, callId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-2 p-3">
        {segments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8">
            Transcript will appear here when the call connects.
          </p>
        )}
        {segments.map((seg) => (
          <div
            key={seg.id}
            className={`text-sm leading-relaxed ${
              seg.speakerLabel === 'agent' ? 'text-brand-primary' : 'text-foreground'
            }`}
          >
            <span className="font-semibold text-xs uppercase mr-2">
              {seg.speakerLabel}
            </span>
            <span>{highlightFillers(seg.text, seg.fillerCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function highlightFillers(text: string, fillerCount: number): React.ReactNode {
  if (fillerCount === 0) return text;
  // Highlight uh/um/like/you know/basically/actually with a subtle bg
  const fillers = /\b(uh|um|like|you know|basically|actually)\b/gi;
  const parts = text.split(fillers);
  return parts.map((part, i) =>
    fillers.test(part) ? <mark key={i} className="bg-yellow-200/60 rounded px-0.5">{part}</mark> : part
  );
}
```

### `CallScreen.Coaching.tsx` — live coaching panel

```typescript
import { useCallCoaching } from '../../hooks/call/useCallCoaching';

export function CallScreenCoaching({ workspaceId, callId }: { workspaceId: string; callId: number | null }) {
  const { metrics, cues, session, acknowledgeCue } = useCallCoaching(workspaceId, callId);

  const wpmColor = !metrics ? 'text-muted-foreground'
    : metrics.wpm < 120 ? 'text-blue-500'
    : metrics.wpm > 160 ? 'text-red-500'
    : 'text-green-500';

  return (
    <div className="flex flex-col h-full overflow-hidden space-y-3 p-3">
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className={`text-2xl font-bold ${wpmColor}`}>{metrics?.wpm ?? '—'}</div>
          <div className="text-xs text-muted-foreground">WPM</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{metrics?.fillerCount ?? '—'}</div>
          <div className="text-xs text-muted-foreground">Fillers</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{metrics?.pauseCount ?? '—'}</div>
          <div className="text-xs text-muted-foreground">Pauses</div>
        </div>
      </div>

      {/* Current cue card */}
      {cues.length > 0 && (
        <div className="rounded-lg border-2 border-brand-secondary/40 p-3 space-y-2">
          {cues.slice(-3).map((cue) => (
            <div key={cue.eventId} className={`p-2 rounded ${cue.acknowledgedAt ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{cue.heading}</span>
                {!cue.acknowledgedAt && (
                  <button
                    onClick={() => acknowledgeCue(cue.eventId)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{cue.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {/* Session summary (shown after call ends) */}
      {session && (
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Session Summary</span>
            <span className="text-2xl font-bold">{session.score}/100</span>
          </div>
          <p className="text-sm text-muted-foreground">{session.summary}</p>
        </div>
      )}
    </div>
  );
}
```

### Layout integration — `callcaster-v2/app/components/call/CallScreen.Layout.tsx`

Add a **tabbed panel** in column 1 below `CallArea`/`Household` (the 3-column grid is already dense; a 4th column would overflow on laptop screens). Tabs: "Transcript" / "Coach" / "Household" (existing). Gate by feature flag from loader.

```typescript
import { CallScreenTranscript } from './CallScreen.Transcript';
import { CallScreenCoaching } from './CallScreen.Coaching';
import { hasFeatureFlag } from '../../lib/feature-flags';

// In the layout, within the first column div:
{coachingEnabled && (
  <Tabs defaultValue="transcript" className="w-full">
    <TabsList>
      <TabsTrigger value="transcript">Transcript</TabsTrigger>
      <TabsTrigger value="coach">Coach</TabsTrigger>
      <TabsTrigger value="household">Household</TabsTrigger>
    </TabsList>
    <TabsContent value="transcript">
      <CallScreenTranscript workspaceId={workspaceId} callId={activeCallId} />
    </TabsContent>
    <TabsContent value="coach">
      <CallScreenCoaching workspaceId={workspaceId} callId={activeCallId} />
    </TabsContent>
    <TabsContent value="household">
      <Household /* existing props */ />
    </TabsContent>
  </Tabs>
)}
```

### Post-call view — `callcaster-v2/app/routes/workspace+/$id/calls/$callId.tsx`

Full transcript (Cohere batch if available, else Deepgram live), coaching session summary, recording playback (`call.audioUrl` signed URL from Railway Buckets), coaching events timeline.

```typescript
import { createTenantDb } from '../../../lib/db';
import { call, callTranscript, transcriptSegment, coachingSession, coachingEvent } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function loader({ params }: LoaderFunctionArgs) {
  const db = createTenantDb(params.id);
  const [callRow] = await db.select().from(call).where(eq(call.id, Number(params.callId)));
  if (!callRow) throw new Response('Not Found', { status: 404 });

  // Prefer Cohere golden transcript, fall back to Deepgram live
  const [transcript] = await db.select().from(callTranscript)
    .where(eq(callTranscript.callId, callRow.id))
    .orderBy(desc(callTranscript.createdAt));

  const segments = await db.select().from(transcriptSegment)
    .where(eq(transcriptSegment.callId, callRow.id))
    .orderBy(asc(transcriptSegment.startMs));

  const [session] = await db.select().from(coachingSession)
    .where(eq(coachingSession.callId, callRow.id));

  const events = await db.select().from(coachingEvent)
    .where(eq(coachingEvent.callId, callRow.id))
    .orderBy(asc(coachingEvent.createdAt));

  // Signed URL for recording playback
  let recordingSignedUrl: string | null = null;
  if (callRow.audioUrl) {
    recordingSignedUrl = await getSignedS3Url(callRow.audioUrl);
  }

  return { call: callRow, transcript, segments, session, events, recordingSignedUrl };
}

export default function CallDetailView() {
  const { call, transcript, segments, session, events, recordingSignedUrl } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      {/* Recording playback */}
      {recordingSignedUrl && (
        <audio controls src={recordingSignedUrl} className="w-full" />
      )}

      {/* Coaching summary */}
      {session && (
        <Card>
          <CardHeader>
            <div className="flex justify-between">
              <CardTitle>Coaching Summary</CardTitle>
              <span className="text-3xl font-bold">{session.score}/100</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center mb-4">
              <div><div className="text-2xl font-bold">{session.wpmAvg}</div><div className="text-xs">Avg WPM</div></div>
              <div><div className="text-2xl font-bold">{session.fillerCount}</div><div className="text-xs">Fillers</div></div>
              <div><div className="text-2xl font-bold">{session.pauseCount}</div><div className="text-xs">Pauses</div></div>
              <div><div className="text-2xl font-bold">{session.longPauseCount}</div><div className="text-xs">Long Pauses</div></div>
            </div>
            <p className="text-sm text-muted-foreground">{session.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Full transcript */}
      {transcript && (
        <Card>
          <CardHeader>
            <CardTitle>Transcript ({transcript.provider === 'cohere_batch' ? 'Cohere' : 'Deepgram Live'})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {segments.map((seg) => (
                <div key={seg.id} className="text-sm">
                  <span className="font-semibold text-xs uppercase mr-2">{seg.speakerLabel}</span>
                  {seg.text}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coaching events timeline */}
      {events.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Coaching Events</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.map((evt) => (
                <div key={evt.id} className="text-sm border-l-2 pl-3 py-1" style={{ borderColor: severityColor(evt.severity) }}>
                  <span className="font-semibold">{evt.type}</span>
                  <span className="text-muted-foreground ml-2">{JSON.stringify(evt.payload)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### Ack endpoint — `callcaster-v2/app/routes/api+/coaching-ack.action.ts`

```typescript
import { createTenantDb } from '../../lib/db';
import { coachingEvent } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function action({ request }: ActionFunctionArgs) {
  const { coachingEventId } = await request.json();
  const db = createTenantDb(/* from session */);

  await db.update(coachingEvent)
    .set({ acknowledgedAt: new Date() })
    .where(eq(coachingEvent.id, coachingEventId));

  return new Response('OK', { status: 200 });
}
```

---

## Stream 7 — Billing metering (ADR-0006)

No DB triggers. Credits updated via Drizzle transaction with `SELECT FOR UPDATE`:

| Event | Debit | Idempotency key | Where |
|---|---|---|---|
| Stream start | Pre-check `workspace.credits >= 1`; skip `<Start><Stream>` if insufficient (fail open — don't block the call, just skip transcription) | — | TwiML route (web service) |
| Stream stop | `ceil(minutes * 0.43)` credits (0.0043 USD/min → 0.43 credits at 1 credit = $0.01) | `transcription:${callId}` | media-stream service |
| Coaching cue | 0.1 credits per cue (~120 cues/hour worst case = 12 credits/hour) | `coaching:${callId}:${cueId}` | media-stream service |
| Cohere batch | 1 credit per call | `transcription_batch:${callId}` | worker |

Rates in `shared/billing-rates.ts` (shared between media-stream service + worker + web).

The debit pattern (from `src/media-stream/db-writer.ts` above):

```typescript
await db.transaction(async (tx) => {
  const inserted = await tx.insert(transactionHistory).values({
    workspaceId, amount, type: 'transcription',
    idempotencyKey: `transcription:${callId}`,
  }).onConflictDoNothing({ target: transactionHistory.idempotencyKey })
    .returning({ id: transactionHistory.id });

  if (inserted.length > 0) {
    await tx.update(workspace)
      .set({ credits: sql`${workspace.credits} + ${amount}` })
      .where(sql`${workspace.id} = ${workspaceId} FOR UPDATE`);
  }
});
```

---

## Schema additions summary (for MCP-aided generation)

When generating the v2 Drizzle schema from the live Supabase Postgres (ADR-0008 phase 1), include these new tables and column alterations in the initial schema — they are NOT a later migration:

### New tables (4)

| Table | PK | FKs | Indexes |
|---|---|---|---|
| `transcript_segment` | `id uuid` | `call_id → call.id` | `idx on call_id` |
| `coaching_event` | `id uuid` | `call_id → call.id` | `idx on call_id` |
| `coaching_session` | `id uuid` | `call_id → call.id` (unique) | — |
| `call_transcript` | `id uuid` | `call_id → call.id` (unique) | — |

### Column additions (2 tables)

| Table | Columns | Type |
|---|---|---|
| `call` | `audio_url`, `transcript_id` (FK → `call_transcript.id`), `coaching_session_id` (FK → `coaching_session.id`) | `text`, `uuid`, `uuid` |
| `workspace` | `feature_flags` (Zod-typed), `coaching_config` (Zod-typed) | `jsonb`, `jsonb` |

### Enum additions (2)

| Enum | New values |
|---|---|
| `workspace_event_type` | `transcript_segment`, `coaching_metrics`, `coaching_cue`, `coaching_session_final` |
| `job.type` | `cohere_batch_transcribe` |
| `transaction_history.type` | `transcription`, `coaching`, `transcription_batch` |

---

## Verification (v2 testing strategy per ADR-0008)

| Layer | Approach |
|---|---|
| Unit tests (PGlite per file) | `coaching-engine` WPM/filler/pause logic, `billing-rates` calculations, Zod schema validation (`WorkspaceFeatureFlags`, `CoachingConfig`, `CoachingEventPayload`), `hasFeatureFlag` helper, Deepgram result parsing, Twilio message parsing |
| Integration tests (PGlite) | media-stream handler with mocked Twilio frames + mocked Deepgram WS → verifies DB writes (`transcript_segment`, `coaching_event`) + `workspace_events` insert + `pg_notify`. Worker job handler with mocked Cohere API + mocked S3 → verifies `call_transcript` insert + `call.transcriptId` repoint + credit debit. Recording webhook with mocked Twilio + mocked S3 → verifies `call.audioUrl` write. |
| E2E (Playwright) | Outbound call with `liveTranscription` flag on → SSE stream delivers transcript segments to UI → coaching cues appear every 30s → hangup → `coaching_session` written → worker batch runs within 15 min → golden transcript replaces live one in call detail view |
| Type safety | `npm run typecheck` (Drizzle `InferSelectModel`/`InferInsertModel` catches shape bugs at compile time; Zod schemas validate JSON columns at runtime boundaries) |
| Routes | `npm run tools:routes:verify` + `tools:routes:imports` |
| Coverage gate | Vitest only (no Deno in v2 — ADR-0008 drops the Deno LCOV merge step) |

---

## Deployment (v2 phase 10)

Three Railway services from the same Docker image:

| Service | CMD | Port | Healthcheck | Autoscale by |
|---|---|---|---|---|
| **web** | `bun run src/web/index.ts` | 3000 | `/healthz` | request volume |
| **worker** | `bun run src/worker/index.ts` | (internal) | `/health` | job queue depth |
| **media-stream** | `bun run src/media-stream/index.ts` | 8081 | `/healthz` | concurrent WS connections |

### Railway service configs

`railway.media-stream.toml`:
```toml
[deploy]
startCommand = "bun run src/media-stream/index.ts"
healthcheckPath = "/healthz"
healthcheckTimeout = 30

[env]
PORT = "8081"
DEEPGRAM_API_KEY = { ref = "DEEPGRAM_API_KEY" }
COHERE_API_KEY = { ref = "COHERE_API_KEY" }
DATABASE_URL = { ref = "DATABASE_URL" }
```

### Required env vars (new, across services)

| Var | Used by | Purpose |
|---|---|---|
| `DEEPGRAM_API_KEY` | media-stream | Nova-3 streaming auth |
| `COHERE_API_KEY` | media-stream + worker | Command A (coaching) + Transcribe (batch) |
| `MEDIA_STREAM_URL` | web (TwiML routes) | `wss://...` URL Twilio connects to (`<Stream url=...>`) |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | web (recording route) + worker (batch) | Railway Buckets (S3-compatible) |

---

## Out of scope (deferred)

- **AI speaking on calls (bidirectional Media Streams)** — re-evaluate if supervisor whisper/barge (ADR-0012 M3 milestone) needs an AI voice leg
- **Autonomous AI coach orchestrator (Phase 2)** — a long-running LLM agent that watches the transcript, decides when to push cues, detects objections, summarizes without a human supervisor. Self-service metrics + LLM cadence (Phase 1) ships first.
- **Cloudflare Agents SDK / Durable Objects** — rejected for v2 (Bun-on-Railway, zero Cloudflare footprint)
- **Supervisor dashboard** — live wallboard of all active call coaching sessions
- **Stripe add-on subscription billing** — coaching is metered against credits for now; a separate subscription tier is a future product decision
- **Multilingual live transcription** — Deepgram Nova-3 is configured for `en-US` initially; Cohere batch supports 14 languages. Per-workspace language config is a future feature.

---

## ADRs written for this feature

- [ADR-0027 — Live transcription via unidirectional Media Streams + Deepgram Nova-3](adr/0027-live-transcription-unidirectional-media-streams-deepgram.md)
- [ADR-0028 — Live coaching via rule-based metrics + Cohere Command A](adr/0028-live-coaching-rule-based-metrics-cohere-command-a.md)
- [ADR-0029 — Post-call golden transcript via Cohere Transcribe batch](adr/0029-post-call-golden-transcript-cohere-batch-worker.md)
- [ADR-0030 — Media-stream Bun service as third Railway process](adr/0030-media-stream-bun-service-third-railway-process.md)

---

## v2 build phase checklist

This feature is ready to implement when the v2 build reaches these phases:

- [ ] **Phase 1 (Schema):** Add 4 new tables + 2 column alterations + 3 enum additions to the MCP-aided Drizzle schema generation
- [ ] **Phase 4 (Worker):** Add `cohere_batch_transcribe` job handler + scheduler entry; ensure ffmpeg in worker Docker image
- [ ] **Phase 5 (Realtime):** Add 4 new `workspace_events` types; build `useCallCoaching` SSE client hook on `@chs/pg-realtime`
- [ ] **Phase 6 (Twilio routes):** Add `<Start><Stream>` TwiML to all 3 call-mode routes (gated by `hasFeatureFlag`); build fixed `/api/recording` route (download → Railway Buckets → `call.audioUrl`)
- [ ] **~Phase 4.5 (Media-stream service):** Build the third Railway service (Bun.serve WS + Deepgram client + coaching engine + Drizzle admin client)
- [ ] **Phase 8 (UI routes):** Build `CallScreen.Transcript` + `CallScreen.Coaching` panels + tabbed layout integration + post-call call-detail view + ack endpoint
- [ ] **Phase 10 (Deployment):** Add `railway.media-stream.toml`; set `DEEPGRAM_API_KEY`, `COHERE_API_KEY`, `MEDIA_STREAM_URL`, `S3_*` env vars
