# Contact Center Platform Plan (design only)

Goal: evolve CallCaster from an outbound campaign platform into a full contact-center-as-a-solution platform. Four milestones, in dependency order:

1. **Inbound ACD foundation** — agent states, inbound call queues, ring strategies.
2. **Inbound IVR builder** — reuse the script engine for inbound menus routing into queues.
3. **Supervisor dashboard** — live wallboard, SLA metrics, listen/whisper/barge.
4. **Exports, shift tracking, operator analytics** — durable export jobs, agent time accounting, richer per-operator metrics.

## Context (what exists today)

- Inbound routing is single-target per number: newest active `handset_session` → forward number → voicemail → fallback `<Say>` ([app/routes/api+/inbound.action.server.ts](../app/routes/api+/inbound.action.server.ts)). No queues, no agent pool.
- "Presence" is a 5-minute heartbeat writing `user.activity` JSON ([app/hooks/call/useSupabaseRoom.ts](../app/hooks/call/useSupabaseRoom.ts)); Supabase realtime presence is subscribed to but never `track()`ed. No agent-state column anywhere.
- IVR is outbound-only: `script.steps` (pages/blocks JSON, [docs/script-structure.md](script-structure.md)) linked via `ivr_campaign`, rendered to TwiML by [app/routes/api+/ivr/](../app/routes/api+/ivr/) (and the parallel Edge runtime).
- Conferences are already used for agent dialing ([app/lib/auto-dial.server.ts](../app/lib/auto-dial.server.ts), `connect-campaign-conference`), which Twilio supports supervisor coaching on.
- Exports are fire-and-forget in-process with status JSON in Storage — no job table, lost on process restart ([app/lib/campaign-export.server.ts](../app/lib/campaign-export.server.ts), [docs/csv-export-contract.md](csv-export-contract.md)).
- Analytics derive everything from `outreach_attempt` ([shared/workspace-analytics.ts](../shared/workspace-analytics.ts)); no inbound, shift, or occupancy concepts.

## Architecture decision: roll our own ACD on Twilio Queues + Conferences (not TaskRouter)

- Twilio TaskRouter would provide routing primitives but adds per-task pricing, a second source of truth, and webhook surface area that duplicates what `campaign_queue` + the `queue-next` tick pattern already prove out in this codebase.
- Instead: inbound calls `<Enqueue>` into Twilio Voice Queues (hold music via `waitUrl`), our own router (Edge function, self-chaining tick modeled on [supabase/functions/_shared/campaign-dispatch.ts](../supabase/functions/_shared/campaign-dispatch.ts)) matches waiting calls to available agents, and bridging happens in a **conference per queue entry** (`acd-{queueEntryId}`). Conferences are required anyway for milestone 3 (listen/whisper/barge use Twilio's conference participant `coach`/`muted` flags).
- Supabase Postgres is the single source of truth for queue entries and agent state; Supabase Realtime (proper `channel.track()` presence + postgres_changes) drives the agent desktop and wallboard.

---

## Milestone 1 — Inbound ACD foundation

### 1.1 Schema (new migration set)

`agent_status` — one row per (workspace, user); source of truth for routing:

| Column | Type | Notes |
|---|---|---|
| `workspace_id` | uuid FK workspace | PK part |
| `user_id` | uuid FK user | PK part |
| `status` | enum `agent_state`: `offline`, `available`, `busy`, `wrap_up`, `away` | default `offline` |
| `status_reason` | text null | e.g. `on_call`, `break`, manual |
| `status_started_at` | timestamptz | for time-in-state |
| `current_queue_entry_id` | bigint null FK | set while reserved/connected |
| `last_heartbeat_at` | timestamptz | desktop heartbeat (30s); router treats stale `available` (> 2 min) as `offline` |
| `updated_at` | timestamptz | |

`agent_status_event` — append-only log (feeds milestone 4 shift tracking):

| Column | Type |
|---|---|
| `id` bigint identity PK; `workspace_id`; `user_id`; `from_status` / `to_status` enum; `reason` text null; `created_at` timestamptz |

`inbound_queue`:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | |
| `workspace` | uuid FK | |
| `name` | text | |
| `greeting_audio` / `hold_audio` | text null | `workspaceAudio/{workspace}/…` paths, same convention as IVR `recorded` blocks |
| `ring_strategy` | enum: `longest_idle`, `round_robin`, `ring_all` | default `longest_idle` |
| `agent_ring_seconds` | int default 20 | per-offer timeout |
| `max_wait_seconds` | int default 300 | then overflow |
| `max_queue_size` | int null | immediate overflow when full |
| `overflow_action` | text null | same overloading as `workspace_number.inbound_action`: phone = forward, email = voicemail, null = hangup message |
| `max_offers` | int default 3 | after N declined/timed-out offers, treat as overflow (prevents callers ping-ponging forever against a distracted team) |
| `service_level_seconds` | int default 30 | SLA threshold for milestone 3 |
| `wrap_up_seconds` | int default 30 | auto-return to `available` after wrap-up |
| `timezone` | text default 'America/New_York' | IANA zone for hours evaluation |
| `business_hours` | jsonb null | `{ mon: [{open:"09:00", close:"17:00"}], … }`; null = always open |
| `after_hours_action` | text null | same grammar as `overflow_action`; null falls back to `overflow_action` |
| `created_at` | timestamptz | |

`inbound_queue_member`: `id`, `queue_id` FK, `user_id` FK, `priority int default 1`, unique (queue_id, user_id).

`inbound_queue_entry` — one row per call that enters a queue (operational + reporting record):

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | |
| `workspace` | uuid | |
| `queue_id` | bigint FK | |
| `call_sid` | text FK call(sid) | the inbound leg |
| `state` | enum `queue_entry_state`: `waiting`, `offering`, `connected`, `wrap_up`, `completed`, `abandoned`, `overflowed` | |
| `assigned_user_id` | uuid null | |
| `offer_count` | int default 0 | declined/timed-out offers |
| `agent_call_sid` | text null | agent leg; needed for whisper (`callSidToCoach`) and bridge-failure recovery |
| `disposition` | text null | set by the agent during wrap-up |
| `enqueued_at` / `offered_at` / `answered_at` / `ended_at` | timestamptz | SLA + AHT math; `enqueued_at` is never reset on re-offer so ordering and wait stats stay honest |
| `conference_name` | text null | `acd-{id}` once bridging starts |
| `claimed_until` | timestamptz null | router claim lease (stale-claim reset, same pattern as `campaign_queue`) |

`workspace_number`: add `inbound_queue_id bigint null FK inbound_queue(id)`. Routing precedence in the inbound webhook becomes: **queue → handset → forward → voicemail → fallback** (milestone 2 inserts IVR ahead of queue).

RLS: workspace-membership read; `agent_status` self-update for own row; queue config admin/owner-managed via existing `workspace_permissions` patterns; service role full access for the router.

### 1.2 Call flow

1. **Inbound webhook** ([inbound.action.server.ts](../app/routes/api+/inbound.action.server.ts)): if `workspace_number.inbound_queue_id` set → evaluate `business_hours` (closed → `after_hours_action` directly, no queue entry) and `max_queue_size` (full → `overflow_action`); otherwise insert `inbound_queue_entry` (`waiting`), respond `<Play greeting/><Enqueue waitUrl="/api/acd/wait/{entryId}">q-{queueId}</Enqueue>` with an `action` URL (`/api/acd/enqueue-result/{entryId}`) to record abandonment/overflow when the call leaves the queue.
2. **Wait loop** (`/api/acd/wait/{entryId}`): plays `hold_audio` (or twimlet hold music); checks elapsed vs `max_wait_seconds` → on timeout, `<Leave>` and the enqueue `action` handler executes `overflow_action`.
3. **Router tick** (new Edge function `acd-router`, modeled on `queue-next`): woken by a DB webhook on `inbound_queue_entry` insert and on `agent_status` transitions to `available`; self-chains at 1s while entries are `waiting`. Each tick, per queue: longest-waiting `waiting` entry × eligible agent per `ring_strategy` (eligible = queue member, `status = 'available'`, fresh heartbeat). Claims atomically via RPC (`claim_queue_entry_for_offer`) — same claim/lease/stale-reset approach as `campaign_queue` claims.
4. **Offer**: set entry `offering`, agent `busy(reason=offering)`; realtime broadcast to the agent desktop. Accept → server dequeues the specific Twilio queue member (`queues(q).members(callSid).update({ url: /api/acd/bridge/{entryId} })`) which `<Dial><Conference>acd-{entryId}</Conference></Dial>`s the caller, and creates the agent client leg into the same conference (reusing the `addToConference` pattern from [auto-dial](../app/routes/api+/auto-dial/)). Caller keeps hearing hold audio until the agent leg actually joins — never silence.
5. **Offer failure handling** (the cases that make or break trust in an ACD):
   - **Decline**: entry → `waiting` (original `enqueued_at` preserved, so the caller stays at the front), agent → `available`, decline logged to `agent_status_event`. Router excludes the declining agent for that entry's next offer.
   - **Ring-no-answer (offer timeout)**: same re-queue, but the agent is auto-set to `away(reason=missed_offer)` — standard ACD behavior; a `available` agent who isn't answering otherwise black-holes the queue. Desktop shows a prominent "You missed a call and were set to Away" banner.
   - **Caller hangs up mid-offer**: enqueue `action` callback fires → entry `abandoned`; cancel the offer in realtime so the agent sees "caller hung up" instead of a dead accept button.
   - **Bridge failure** (agent accepted but their leg errors/never joins within ~10s): re-queue the entry at front, agent → `away(reason=connect_failed)`, surface a device-error toast.
   - **`offer_count` ≥ `max_offers`**: treat as overflow → `overflow_action`; the caller is never bounced indefinitely.
6. **Hangup**: conference status callbacks (`/api/acd/conference-status`) mark entry `wrap_up`/`completed`, stamp `ended_at`, put the agent in `wrap_up` with auto-return after `wrap_up_seconds` (agent can end wrap-up early or extend once).
7. **Disposition**: agent desktop posts a disposition onto the entry (reuse the disposition UI from CallScreen). Wrap-up auto-expiry saves with `disposition = null` rather than blocking the agent — supervisors see undispositioned counts on the wallboard instead of agents getting stuck.

### 1.3 Agent desktop

- Evolve `workspaces+/$id/handset.route.tsx` into an **agent desktop**: status switcher (Available / Away / Offline with reasons), incoming offer card (caller ID, queue name, wait time, accept/decline with countdown), active-call panel (mute/DTMF/hold via existing `useCallHandling`), wrap-up timer + disposition form.
- Replace the 5-min `user.activity` heartbeat with: (a) `agent_status` row updates through a small API (`api+/agent-status`), (b) proper Supabase Realtime presence (`channel('acd:{workspaceId}').track(...)`) for instant UI, (c) 30s heartbeat updating `last_heartbeat_at`. The campaign call screen sets `busy(reason=outbound_campaign)` while dialing so inbound never offers to an agent mid-campaign (exclusive-first decision below).
- **Going-Available preflight**: before the agent can flip to Available, run a device check — mic permission granted, audio output selected, Twilio Device registered. Permission denied or no device → status stays Offline with an inline fix-it guide (the single biggest source of "agent looks online but every offer times out").
- **Single active session**: one desktop session per agent per workspace (extends the `handset_session` "newest wins" model into an explicit takeover — opening a second tab prompts "Take over from your other session?" and ends the old one via realtime, instead of two tabs silently competing for the same Twilio identity).
- **Backgrounded-tab offers**: offers play an audible ring, flash the document title, and fire a browser Notification (permission requested during preflight). Offer countdown is server-authoritative; a throttled background tab can't extend it.
- **Reconnect honesty**: on network drop / laptop sleep, the desktop detects the broken realtime channel + stale heartbeat and shows "You were marked Away at HH:MM" on reconnect, rather than silently pretending the agent was Available the whole time.

### 1.4 Billing

- Inbound staffed minutes billed like outbound staffed calls (rate card in [shared/pricing.ts](../shared/pricing.ts)); debit from the conference/call status callback with idempotency keys, same pattern as `ivr-status`/`sms-status` ledger writes. Add `inbound_queue_call` transaction type to [docs/billing-source-of-truth.md](billing-source-of-truth.md).
- **Bill connected time only** (`answered_at → ended_at`). Hold/queue time and abandoned calls are not debited as staffed minutes — punishing customers for their own wait time is a known CCaaS resentment generator. (Twilio still charges us for the inbound leg during hold; this margin cost is accepted and noted in the pricing brief.)
- **Out-of-credits policy**: never reject an inbound call outright. Balance ≤ 0 → numbers route as if after-hours (voicemail/forward per config) and the workspace gets the existing low-balance surfaces. Outbound stays hard-blocked as today; inbound degrades gracefully because the caller is the customer's customer.

---

## Milestone 2 — Inbound IVR builder

### 2.1 Data model

- Reuse the `script` table with `type = 'inbound_ivr'`; same `steps` pages/blocks document ([docs/script-json-format.md](script-json-format.md)).
- New **option target grammar** (extends the existing `next` values `hangup` / `pageId:blockId` / `page_…`):
  - `queue:{queueId}` — enqueue into an inbound queue (milestone 1 flow takes over).
  - `forward:{e164}` — `<Dial>` a number.
  - `voicemail:{email}` — reuse [inbound-voicemail-twiml](../app/lib/inbound-voicemail-twiml.server.ts).
- `workspace_number`: add `inbound_script_id bigint null FK script(id)`. Precedence: **IVR script → queue → handset → forward → voicemail**.

### 2.2 Runtime

- New routes `api+/inbound-ivr/$numberId/$pageId/$blockId(.response)` cloned from the campaign IVR runtime ([api+/ivr/](../app/routes/api+/ivr/)) — same `handleAudio`/`handleOptions`/Gather semantics, minus campaign/outreach-attempt coupling; the terminal targets above replace campaign result writes. Build on the **Remix runtime only** (do not extend the Edge IVR runtime; consolidation is already pending per [docs/ivr-remix-vs-edge-audit.md](ivr-remix-vs-edge-audit.md)).
- Inbound webhook: when `inbound_script_id` set → `<Redirect>` to the script's first page/block.

### 2.3 Builder UI

- Extend the existing script editor ([app/components/script/](../app/components/script/)) with a destination picker on options when `script.type = 'inbound_ivr'`: dropdowns for workspace queues, voicemail email, forward number. Number settings page (`settings/numbers`) gets an "Inbound handling" section choosing between IVR script / queue / handset / forward / voicemail.

---

## Milestone 3 — Supervisor dashboard

### 3.1 Wallboard (`workspaces+/$id/supervisor.route.tsx`, role-gated owner/admin)

- **Live tiles per queue** (realtime via postgres_changes on `inbound_queue_entry` + `agent_status`): calls waiting, longest current wait, agents by state, active conversations.
- **Today's SLA metrics** (RPC aggregate over `inbound_queue_entry`): service level (% answered within `service_level_seconds`), abandon rate, average wait, AHT (`answered_at→ended_at` + wrap-up), offers declined.
- **Agent grid**: state, time in state, current call duration, calls handled today.

### 3.2 Listen / whisper / barge

- All bridged calls live in conference `acd-{entryId}` (and outbound campaign calls already use conferences), so:
  - **Listen**: add supervisor participant with `muted: true, coaching: false`.
  - **Whisper**: `coaching: true, callSidToCoach: {agentLegSid}` (agent hears supervisor; caller doesn't).
  - **Barge**: `muted: false`.
- New API `api+/acd/monitor` (validates owner/admin, creates the supervisor client leg via the existing Voice SDK token flow). Store the agent leg `call_sid` on the entry to support `callSidToCoach`. Monitoring events logged to `agent_status_event`-style audit rows for compliance.
- Extend to outbound campaign conferences (named `{user_id}` today) in a follow-up once ACD monitoring is proven.

---

## Milestone 4 — Exports, shift tracking, operator analytics

### 4.1 Durable export jobs

- New `export_job` table: `id`, `workspace`, `type` (`campaign_messages`, `campaign_calls`, `inbound_queue_entries`, `agent_activity`, `calls_log`), `params jsonb`, `status` (`pending`,`running`,`completed`,`failed`), `progress`, `storage_path`, `requested_by`, `created_at`, `started_at`, `finished_at`, `error`.
- Replace the fire-and-forget in-process export with: insert job → process via the existing chunked generators, but checkpoint progress to the row so a restart can detect orphaned `running` jobs (stale-claim reset) and surface failure instead of hanging forever. Keep Storage for the CSV artifacts, signed-URL contract, and **all rules in [docs/csv-export-contract.md](csv-export-contract.md)** unchanged. The status endpoint reads the row instead of the Storage JSON (keep writing the JSON during a deprecation window for any in-flight clients).
- New export types: queue entries (per-call inbound detail) and agent activity (per-status-interval rows from `agent_status_event`).

### 4.2 Shift tracking

- Derived from `agent_status_event`: contiguous non-`offline` intervals = a shift/session. RPC `agent_shift_summary(workspace, from, to)` returns per-user: shift count, total logged-in time, time per state (available/busy/wrap_up/away), occupancy (busy ÷ logged-in).
- Optional explicit clock-in/out: the desktop status switcher's `offline → available` and `→ offline` transitions are the clock punches — no separate timeclock table needed initially. Manual-adjustment tooling deferred.

### 4.3 Operator analytics

- Extend [shared/workspace-analytics.ts](../shared/workspace-analytics.ts) with inbound + shift inputs: per-operator inbound calls handled, AHT, average wrap-up, offers declined, occupancy, alongside the existing outbound dial/connect metrics. Inputs: existing `outreach_attempt` query + new `inbound_queue_entry` and shift-summary RPCs (same `from`/`to`/role-scoping contract as today, [app/lib/workspace-analytics.server.ts](../app/lib/workspace-analytics.server.ts)).
- Analytics page gains tabs: **Outbound** (today's panel), **Inbound** (queue/SLA aggregates), **Agents** (shift + occupancy table, exportable via `agent_activity` export job).

---

## Edges: UX, onboarding, and operational pain points

### Setup & onboarding flow

- **"Receive calls" onboarding path**: the existing onboarding wizard ([workspaces+/$id/onboarding/](../app/routes/workspaces+/)) is outbound-biased (messaging service, first campaign). Add an inbound track: buy/pick a number → create a queue → add yourself as a member → go Available → **test call**. Target: first inbound call answered in under 10 minutes.
- **Verified test call**: a "Call my queue" button on the queue settings page that dials the agent's own verified number (reusing the caller-ID verification machinery in [app/lib/caller-id-verification.server.ts](../app/lib/caller-id-verification.server.ts)) through the full IVR/queue path — so admins validate the experience without a second phone.
- **Empty/degenerate states are first-class, not errors**:
  - Queue with zero members → assignable, but the number settings and queue list show a persistent "no agents — all calls will overflow" warning.
  - Queue with members but nobody Available → wallboard tile and queue list show "0 agents available"; calls wait then overflow as configured (this is normal nights/weekends behavior, not a failure).
  - Number with a queue but no overflow/after-hours action → setup nudges toward configuring voicemail as the safety net before activation.
- **De-overload `inbound_action`**: today a phone number means forward and an email means voicemail in one string column — invisible magic. The number settings UI becomes an explicit "Inbound handling" choice — **IVR script / Queue / Handset / Forward to number / Voicemail to email** — with per-choice fields. Storage keeps the existing columns plus the two new FKs (no data migration); the UI stops exposing the string overloading.
- **Settings IA**: queues live at `workspaces+/$id/settings/queues` (list + detail: members, audio, hours, overflow) alongside `settings/numbers`; audio pickers reuse the existing workspace audio library (`workspaces+/$id/audios/`, ffmpeg-normalized) — no parallel uploader.

### Admin guard rails

- Deleting a queue referenced by a `workspace_number` or an IVR `queue:` target → blocked with a list of referencing numbers/scripts (same for deleting an inbound IVR script assigned to a number). Enforced at the API layer and with FK `ON DELETE RESTRICT`.
- Removing the last member from a queue that's live on a number → confirm dialog spelling out where calls will go instead.
- Deactivating handset/queue on a number while calls are waiting → entries drain normally (router keeps serving existing `waiting` entries); only new calls follow the new config.
- Role gating: queue/IVR/number config = owner/admin via existing `workspace_permissions`; agents (`caller` role) get the desktop and their own status only.

### Caller experience

- Hold loop announces periodically (every ~45s): a configurable reassurance message between hold-music stretches, so callers know they haven't been forgotten. Position-in-queue announcements and **callback-instead-of-holding** ("press 1 and we'll call you back") are explicitly *not* in M1 — but `queue_entry_state` and the wait-loop TwiML structure are designed so a `callback_requested` state slots in later without schema surgery.
- After-hours and overflow always end somewhere intentional (voicemail/forward/polite message) — the current fallback `<Say>` "unable to answer" remains only as the never-configured last resort.
- Voicemail produced by queue overflow/after-hours lands in the existing voicemail inbox ([workspaces+/$id/voicemails.route.tsx](../app/routes/workspaces+/)) and email pipeline, tagged with the queue name so teams know which line missed the call.

### IVR builder edges (M2)

- **Activation validation**: extend the existing script validation ([docs/script-validator.js](script-validator.js) lineage) for inbound scripts — unreachable blocks, options with no `next`, dangling `queue:{id}` references (queue deleted), missing audio files. A script with errors can be saved but not assigned to a number.
- **Always-an-exit rule**: every block must terminate (hangup/forward/voicemail/queue) or navigate; gather-timeout fallbacks get a default destination so silent callers (rotary phones, pocket dials, IVR-confused humans) aren't looped forever — default after 2 unmatched attempts: replay menu once, then route to the script's configured fallback destination.
- DTMF-first for inbound menus: speech matching stays supported (existing engine), but the builder defaults new inbound options to digits — speech recognition surprises (`vx-any`) are opt-in.

### Supervisor & compliance edges (M3)

- Monitoring announcement: per-workspace toggle to prepend "this call may be monitored or recorded" to queue greetings (compliance requirement in many jurisdictions; ship the toggle with the greeting work in M1 so M3 monitoring doesn't launch ahead of consent).
- Every listen/whisper/barge session is audit-logged (who, which call, which mode, when) and visible to owners.
- Wallboard surfaces *actionable* anomalies, not just numbers: agents stuck in wrap-up > N min, agents Away via `missed_offer`, undispositioned calls, queues with waiters but zero eligible agents.

### Migration & compatibility

- **Existing handset users keep working unchanged**: handset routing remains in the precedence chain; a solo operator never needs to create a queue. The desktop's status switcher subsumes the current "ringing on/off" toggle (Available/Offline maps 1:1), so the handset page upgrade is a strict superset.
- **`user.activity` consumers audited before removal**: the campaign room heartbeat ([useSupabaseRoom.ts](../app/hooks/call/useSupabaseRoom.ts)) keeps writing during a deprecation window; `agent_status` becomes the only routing input from day one so the two never disagree about eligibility.
- All new behavior is opt-in per number (`inbound_queue_id` / `inbound_script_id` unset = today's behavior); no flag day.

### Known pain points this plan deliberately avoids

- **Ghost agents** (looks available, never answers) → heartbeat staleness + missed-offer auto-away + preflight device check.
- **Caller limbo** (infinite hold, dead ends) → `max_wait_seconds`, `max_offers`, always-an-exit IVR rule, mandatory-ish overflow config nudges.
- **Two sources of truth for who's available** → `agent_status` is the only routing input; realtime presence is a UI accelerant, never authoritative.
- **Billing surprises** → connected-time-only debits, no charge for abandoned calls, graceful inbound degradation when credits run out.
- **Config landmines** → FK restrict + referencing-object warnings instead of silent breakage when deleting queues/scripts.

---

## Rollout order & dependencies

1. ✅ M1 schema + agent desktop status (shippable alone — replaces the heartbeat hack), including the going-Available preflight and single-session takeover.
   - Migration `20260610210000`: `agent_state` enum, `agent_status` + `agent_status_event` tables with RLS.
   - `api+/agent-status` (GET/POST) for status transitions with validation + event logging.
   - `useAgentStatus` hook with 30s heartbeat and realtime `postgres_changes`.
   - `AgentDesktop` component: status bar, preflight device check, away/offline reasons, status-aware idle state.
   - Old `user.activity` heartbeat continues during deprecation window per plan.
2. ✅ M1 queue routing end-to-end behind a per-workspace flag (`workspace_number.inbound_queue_id` simply unset = current behavior; zero migration risk), with queue settings UI, guard rails, and the "Call my queue" test flow.
   - Migration `20260610215000`: `queue_entry_state` enum, `inbound_queue`, `inbound_queue_member`, `inbound_queue_entry` tables with RLS, RPCs (claim/release/complete/abandon/accept/next), `workspace_number.inbound_queue_id` FK.
   - `supabase/functions/_shared/acd-utils.ts` — pure utility functions (TwiML generation, queue name helpers).
   - `supabase/functions/_shared/acd-router.ts` — DB operations (agent claim, lookup, dial, release, next offer).
   - `supabase/functions/acd-router/index.ts` — Edge Function serving four URL paths: `/` (wait URL, TwiML + side-effect agent dialing), `/agent-bridge` (agent answer → `<Queue>` dequeue), `/agent-status` (dial status callback → timed_out release), `/complete` (Enqueue action → completed/abandoned).
   - `supabase/config.toml`: `acd-router` added with `verify_jwt = false`.
   - `app/routes/api+/inbound.action.server.ts`: Queue routing is the highest priority check before handset/forward/voicemail. Returns `<Enqueue waitUrl="acd-router?queue_id=X">` when number has `inbound_queue_id`.
   - `app/routes/api+/inbound-queue.tsx` + loader/action: CRUD for queues and member management (GET list, POST create, PUT update, DELETE delete, PATCH add/remove member).
   - `app/routes/workspaces+/$id/settings/queues.route.tsx`: Queue settings UI (list, create, edit, delete queues, manage members, view linked numbers).
   - `app/routes/workspaces+/$id/settings/numbers.route.tsx` + `NumbersTable.tsx`: Added queue assignment column per number (dropdown of workspace queues).
   - `app/routes/workspaces+/$id/settings.route.tsx`: Added "Manage Agent Queues" card with NavLink.
   - Tests: Deno unit tests for `acd-utils` (`acd_router_test.ts`), SQL integration tests for RPCs (`inbound_queue_routing.sql`), Vitest tests (`inbound-queue.test.ts`).
   - `database.types.ts`: `queue_entry_state` enum, `inbound_queue`/`inbound_queue_member`/`inbound_queue_entry` tables, `workspace_number.inbound_queue_id`, RPC function types.
3. M2 inbound IVR (depends on M1 queues as routing targets, but `forward:`/`voicemail:` targets work without queues), with activation validation and the always-an-exit rule.
4. M3 wallboard (reads M1 tables) → then monitor/whisper/barge (monitoring-announcement toggle ships earlier, in M1 greetings).
5. M4 export jobs (independent; can start anytime) → shift/analytics (depends on M1 `agent_status_event`).
6. Onboarding "receive calls" track lands with step 2 (it's the adoption funnel for everything above).

## Testing & quality gates

- Per repo standard: Vitest node tests for every new lib/route module, Deno tests for the `acd-router` Edge function (mirror `campaign-dispatch` test style), UI tests for the agent desktop and wallboard, SQL tests for claim RPCs (like `supabase/tests/campaign_queue_throughput.sql`), coverage merged via the existing gate.
- TwiML snapshot tests for the inbound webhook precedence matrix (IVR/queue/handset/forward/voicemail × business hours × queue full × zero credits).
- Offer-lifecycle state-machine tests (decline / ring-no-answer / caller-hangup-mid-offer / bridge-failure / max-offers) as pure-logic units, plus timezone/DST cases for `business_hours` evaluation.
- Route tree baseline updates (`npm run tools:routes:verify`) for each new route.

## Resolved decisions (product sign-off)

1. **Hold music**: ship with the twimlet default (as campaign conferences use today); workspaces may optionally upload custom `hold_audio`.
2. **Blended agents**: exclusive at launch — agents on an outbound campaign are `busy(reason=outbound_campaign)` and never offered inbound calls. Blending is a later routing-tick policy change.
3. **Inbound pricing**: same staffed rate as outbound live calls (4 credits to start + 5/min per [shared/pricing.ts](../shared/pricing.ts)), recorded under a distinct `inbound_queue_call` transaction type so the rate can diverge later without migration.
4. **Contact matching**: deferred to M3 (screen-pop on the agent offer card + wallboard); `inbound_queue_entry` carries `call_sid` so the caller number is always joinable later.
