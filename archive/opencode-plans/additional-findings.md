# Additional findings from deeper investigation

## What I missed and how it changes the plan

### 1. Browser softphone architecture (ADR-worthy)

**Finding:** CallCaster has a full Twilio Voice SDK softphone in the browser — 17 hooks in `app/hooks/call/` managing device connection, call handling, predictive dial sync, call state machine (`idle → ringing → dialing → connected → connected_with_held → completed → failed`), DTMF, mute/hold, incoming calls, conference dialing. Plus `app/lib/twilio/` client adapters. Plus `app/components/call/` with CallScreen (CallArea, DTMFPhone, Header, Household, Layout, Questionnaire, QueueList).

**ADR-0024: Browser-based softphone via Twilio Voice SDK**
CallCaster uses the Twilio Voice SDK running in the browser as its softphone, not a separate softphone app, desk phones, or a mobile app. The browser is the phone. 17 React hooks coordinate device connection, call state machine, predictive dial sync, audio devices, DTMF, mute/hold, and conference bridging. The Twilio Voice SDK token is minted per-workspace (ADR-0016). This is a deliberate, hard-to-reverse, surprising-without-context decision.
- _References_: `app/hooks/call/` (17 hooks), `app/lib/twilio/call-session-types.ts` (canonical call session phases), `app/lib/twilio/twilio-call-adapter.client.ts`, `app/components/call/CallScreen.*.tsx`, `@twilio/voice-sdk` in `package.json:76`
- _Considered_: Separate softphone app (more deployment complexity), desk phones (no software control), mobile app (different SDK, smaller form factor)

### 2. Dial mode: manual vs predictive (ADR-worthy)

**Finding:** `dial_type` enum has two values: `"call"` (manual — agent clicks dial) and `"predictive"` (auto-dial — `queue-next` Edge function paces calls based on `dial_ratio`). The call screen branches behavior on this: `useCallScreen.ts` checks `campaign.dial_type === "predictive"` to route to predictive queue vs manual queue. `usePredictiveCallSync.ts` syncs the predictive state machine (dialing → connected → completed/failed/no-answer).

**ADR-0025: Dual dial modes (manual + predictive)**
CallCaster supports two dial modes: manual ("call") where the agent initiates each dial, and predictive where the system auto-dials ahead based on a dial ratio. The predictive mode uses the `queue-next` self-chaining dispatch tick to pace calls and the `usePredictiveCallSync` hook to sync state to the agent desktop. This is a core product decision — it determines the entire call flow architecture.
- _References_: `app/hooks/call/useCallScreen.ts` (`isPredictive: campaign?.dial_type === "predictive"`), `app/hooks/call/usePredictiveCallSync.ts`, `app/lib/getNextContact.js` (household-aware next-recipient logic), `supabase/functions/queue-next/index.ts` (predictive dispatch tick → worker in v2), `campaign.dial_ratio` field
- _Considered_: Predictive-only (simpler but loses manual control for small teams), manual-only (no efficiency gain for high-volume calling)

### 3. quick-canvass is the proven reference implementation (de-risks the entire plan)

**Finding:** quick-canvass (`~/WebProjects/quick-canvass`) is ALREADY running the exact v2 stack I proposed:
- Drizzle schema (`app/db/schema.ts` — `pgTable`, `pgEnum`, typed columns)
- Better Auth (`app/server/auth-instance.ts`, `@chester-hill-solutions/auth-postgres`)
- `postgres` driver with workspace-scoped sessions (`app/lib/db-session.server.ts`)
- `workspaceEvents` table (the pg-realtime event log — ADR-0005)
- `workspaceActivityLog` (append-only activity log)
- `backgroundJobs` table with `type`, `status`, `payload` jsonb, `idempotencyKey` (ADR-0007)
- Full job worker system (`job-enqueue.server.ts`, `job-processor.ts`, `job-worker.ts`, `job-worker-http.server.ts`, `worker-wake.server.ts`)
- `households` as a first-class `pgTable` with address, geocode, ward number (ADR-0021)
- SSE event stream (already found earlier — `workspace-event-stream.tsx`)
- `workspace_role` enum: `admin | organizer | canvasser`

**How it changes the plan:**
- The v2 ADRs are not speculative — they document the **proven quick-canvass pattern** as the target for CallCaster
- Every ADR from 0003-0010 and 0021 should reference quick-canvass as the reference implementation
- The job table shape should match quick-canvass's `backgroundJobs` (it's nearly identical to what I proposed — the only difference is no `claimed_until`; they use `status: "queued" → "processing" → "completed"` instead of a lease)
- The `buildJobIdempotencyKey` pattern (SHA-256 hash of type + workspaceId + payload) is the proven approach — better than my proposed `(type, idempotency_key)` unique index because it's deterministic from the payload
- quick-canvass's `triggerWorkerWake` (`worker-wake.server.ts`) is the NOTIFY equivalent
- The household table shape is already proven: `householdKey`, address components, geocode status, ward number — CallCaster should adopt this shape

**This de-risks the entire strangler-fig because the target stack is proven in production by a sibling app.**

### 4. Conversation/SMS threading (NOT ADR-worthy, but domain-relevant)

**Finding:** `workspace-conversations.server.ts` builds SMS conversation threads by grouping messages by phone number pairs (workspace number ↔ contact phone), with `ConversationSummary` tracking `contact_phone`, `user_phone`, `conversation_start`, `conversation_last_update`, `message_count`, `unread_count`, `has_replied`. The chat UI (`workspaces+/$id/chats/`) shows threaded conversations with a sidebar. This is a standard conversation threading pattern, not an architectural decision.

### 5. Campaign readiness rules (NOT ADR-worthy, but domain-relevant)

**Finding:** `campaign-readiness.ts` defines 14 readiness codes: `campaign_not_loaded`, `campaign_type_required`, `outbound_number_required`, `messaging_sid_required`, `messaging_senders_unavailable`, `dates_required`, `dates_invalid`, `start_after_end`, `calling_hours_required`, `invalid_intervals`, `queue_empty`, `bulk_sender_misaligned`, `script_required`, `message_content_required`. These are business rules, not architecture. They encode domain knowledge (campaigns need numbers, scripts, dates, calling hours, queue) but aren't ADR-worthy.

### 6. Script engine navigation (NOT ADR-worthy, already documented)

**Finding:** The script JSON format (pages/blocks with `option.next` navigation: `hangup`, `pageId:blockId`, `page_` prefix, or block id) is already documented in `docs/script-structure.md` and `docs/script-json-format.md`. The engine is in `@chester-hill-solutions/scriptkit-call-script-core`. Not a new finding.

## Updated ADR count: 25 ADRs + CONTEXT.md

| Range | Topic | Count |
|---|---|---|
| 0001-0010 | v2 infrastructure | 10 |
| 0011-0018 | Non-v2 existing decisions | 8 |
| 0019-0023 | Domain-driven from political science | 5 |
| 0024-0025 | New: browser softphone + dual dial modes | 2 |
| **Total** | | **25** |

## ADRs that should reference quick-canvass as reference implementation

- ADR-0003 (Drizzle) → quick-canvass `app/db/schema.ts`
- ADR-0004 (scoped client) → quick-canvass `app/lib/db-session.server.ts`
- ADR-0005 (pg-realtime) → quick-canvass `workspaceEvents` table + SSE stream
- ADR-0007 (job table + worker) → quick-canvass `backgroundJobs` table + `job-enqueue.server.ts` + `job-processor.ts` + `job-worker.ts`
- ADR-0010 (Better Auth) → quick-canvass `auth-instance.ts` + `@chester-hill-solutions/auth-postgres`
- ADR-0021 (household as entity) → quick-canvass `households` pgTable

## Job table correction

My proposed job table had `claimed_until` + `FOR UPDATE SKIP LOCKED`. quick-canvass uses `status: "queued" → "processing" → "completed"` without a lease. 

**Revised recommendation:** Adopt quick-canvass's pattern (status-based, no lease) as the default, but add `claimed_until` for CallCaster's ACD router which needs lease semantics for the "offer to agent, timeout if no answer" pattern. The job table should have BOTH: `status` for simple jobs (exports, imports, geocoding) and `claimed_until` for time-sensitive claims (ACD offers, predictive dialing). This is a superset of quick-canvass's pattern.

## Idempotency key correction

My proposed `(type, idempotency_key)` unique index with manually-specified keys should be replaced with quick-canvass's proven `buildJobIdempotencyKey` pattern: SHA-256 hash of `{type, workspaceId, payload}` → deterministic key. This is better because:
1. No need for callers to invent keys
2. Deterministic from the payload — same job request = same key = no duplicate
3. Already proven in production

For cron jobs (number-rental-billing, reconciliation), the idempotency key should include the date: `buildJobIdempotencyKey({type: "number_rental_billing", workspaceId: null, payload: {date: "2026-06-27"}})`.
