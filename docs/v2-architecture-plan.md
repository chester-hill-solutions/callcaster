> **Superseded (2026-06-29):** Use [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md) and [`docs/adr/`](./adr/) for execution. In-place migration on this repo — not `callcaster-v2` fork.

# CallCaster v2 Architecture Plan
**Date:** 2026-06-27
**Method:** grill-with-docs skill — interviewed user relentlessly, explored codebase, resolved each branch with recommended answer.

---

## How to continue after compaction

1. Read this file in full.
2. Create `docs/adr/` directory lazily with the first ADR.
3. Create `CONTEXT.md` at repo root lazily with the first glossary term.
4. Write ADR-0001 through ADR-0018 using the format in `.agents/skills/grill-with-docs/ADR-FORMAT.md` (short paragraph + optional Considered Options/Consequences + code references).
5. Each ADR's content is in the "ADR Set" section below — copy the decision text, references, and considered options.
6. The "What v2 accomplishes" section is context for the ADRs, not a separate file.
7. Do NOT write the ADRs to `docs/` as flat files — they go in `docs/adr/` with sequential numbering `0001-slug.md`.

---

## ADR Set (18 ADRs + CONTEXT.md)

### v2 Architecture (shed Supabase-the-product) — ADR-0001 through ADR-0010

#### ADR-0001: Bun as the single runtime

`Bun.serve` replaces Express. The `@react-router/express` adapter is a compatibility shim that wraps the core RR7 Web Fetch API handler into Express's `(req, res, next)` — `Bun.serve` takes `(Request) => Response` natively, removing the conversion layer. The worker process (ADR-0007) is also Bun, same binary, different entry point. Drops `express`, `compression`, `cookie-parser`, `morgan`, `tsx`, `@react-router/express`, and the `buffer-polyfill` client shim (Bun has Buffer natively). Step 0 of the strangler-fig.

- _References_: `server/index.js:155` (Express handler), `node_modules/@react-router/express/dist/index.js:46` (shim — `return async (req, res, next) => { let request = createRemixRequest(req, res); ...}`), `package.json:69-70` (both `@react-router/express` and `@react-router/node` present), `app/buffer-polyfill.client.ts`, `package.json:8` (`build:buffer-polyfill` script)
- _Considered_: Keep Express during migration, swap at end (carries boilerplate for no benefit); separate Deno runtime for Twilio specials (reintroduces dual-runtime duplication); keep Express permanently (loses performance + simplicity + single-runtime-with-worker benefits)

#### ADR-0002: Shed Supabase-the-product, keep Postgres on Railway

Postgres-the-database stays, hosted on Railway (branchable for strangler-fig testing). Shed every Supabase-product surface: Auth, Realtime, Storage, Edge Functions, RLS, pg_cron, table triggers, the Supabase JS client (`@supabase/supabase-js`, `@supabase/ssr`), and the 3,093-line `database.types.ts` (173 files import it). Adopt Drizzle + Better Auth + S3-compatible storage from existing `@chester-hill-solutions/*` packages. Fixes the debt of excessive DB-side magic, low type adoption, and unwieldy tables.

- _References_: `package.json:56` (`@electric-sql/pglite` — phantom dep, used nowhere), `package.json:73-74` (`@supabase/ssr`, `@supabase/supabase-js`), `supabase/config.toml` (Edge functions config), `app/lib/database.types.ts` (3093 lines), 173 files import `database.types`
- _Considered_: Drop Postgres too (multi-quarter rewrite, contradicts "small window" — all chs packages are Postgres-based); keep Supabase Postgres hosting only (keeps a dependency you want gone)

#### ADR-0003: Drizzle + postgres driver, hybrid with plpgsql RPCs

Drizzle ORM for all CRUD/queries/joins — end-to-end TypeScript types (fixes "low type adoption" debt). Claim/lease/dequeue concurrency logic stays as plpgsql RPCs (`FOR UPDATE SKIP LOCKED` + atomic claim→update→return), called via `db.execute(sql\`select claim_campaign_queue_contacts(...)\`)` with typed wrappers. Rewriting proven concurrency in a query builder re-introduces race conditions the RPCs were written to eliminate. The SQL that should go is the trigger magic and untyped CRUD, not the concurrency primitives.

- _References_: `supabase/migrations/20260521140000_queue_state_and_claim.sql:74` (`claim_campaign_queue_contacts`), `supabase/migrations/20260610215000_inbound_queue_routing.sql:199` (`claim_inbound_queue_entry`), `supabase/migrations/20260415120000_add_dequeue_fields.sql:19` (`dequeue_contact`), `supabase/migrations/20260415120000_add_dequeue_fields.sql:56` (`dequeue_household`), `supabase/migrations/20260610215000_inbound_queue_routing.sql:253` (`release_inbound_offer`)
- _Considered_: Pure Drizzle, rewrite all RPCs as TS transactions with `.for('update').skipLocked()` (re-implements proven concurrency, risks subtle races on claim+update+return); raw pg driver, no ORM (re-implements type generation by hand); Drizzle for new code only, raw RPC calls for legacy (leaves type-safety debt on most-touched tables)

#### ADR-0004: Scoped Drizzle client, no RLS

`createTenantDb(workspaceId)` returns a Drizzle instance where every table with a `workspace` column is auto-scoped on every query. A separate admin client exists for cross-workspace ops (worker, cron, billing reconcile). `requireWorkspaceAccess` stays as the membership/role gate. The scoped client is the only exported tenant-data accessor for route code; the admin client is not importable from routes (separate module boundary). No RLS — testable, explicit, no Supabase magic. Extend `test/authz.test.ts` to assert `createTenantDb("A")` cannot read workspace B's rows for every tenant table.

- _References_: `app/lib/database/workspace.server.ts` (existing `requireWorkspaceAccess` — checks `workspace_users` membership/role), `test/authz.test.ts` (existing authz tests to extend — tests owner/admin/member/caller roles)
- _Considered_: Keep RLS on raw Postgres with `SET app.current_workspace` per session (conflicts with shedding magic, hard to test — existing test suite only tests app-layer gate, not RLS); app-layer only with no structural enforcement (single forgotten `.where(eq(workspace, id))` = cross-tenant leak with no backstop)

#### ADR-0005: pg-realtime — SSE + workspace_events + LISTEN/NOTIFY

All three Supabase Realtime features (postgres_changes, presence, broadcast) collapse into one transport: Server-Sent Events via browser-native `EventSource` + an append-only `workspace_events` table + Postgres `LISTEN/NOTIFY` wake + adaptive polling fallback + cursor resume via `Last-Event-ID`. Event log rows on state transitions only, never on heartbeats (heartbeats update `agent_status.last_heartbeat_at` in place; transitions insert an event + NOTIFY). Extract as `@chester-hill-solutions/pg-realtime` shared package, contributed back to the chs monorepo. The pattern is proven in quick-canvass. Predictive-dial "broadcasts" are event-shaped (Twilio-callback-driven, unidirectional, resume-valuable) so they fit SSE too — no need for a second WS transport.

- _References_: `app/hooks/call/useSupabaseRoom.ts:168` (presence sync — `.on('presence', { event: 'sync' }, ...)`), `app/hooks/call/useSupabaseRoom.ts:157` (broadcast — `.on('broadcast', { event: 'message' }, ...)`), `app/hooks/call/useSupabaseRoom.ts:112-115` (5-min heartbeat writes `user.activity` JSON), `app/routes/api+/auto-dial/status.action.server.ts:189,255,309` (predictive-dial broadcasts from Twilio callbacks — low-frequency, unidirectional), quick-canvass `app/features/workspace-events/workspace-event-stream.tsx` (proven SSE client with EventSource + cursor + reconnect), quick-canvass `app/server/workspace-events-stream.server.ts` (LISTEN/NOTIFY + adaptive poll fallback), quick-canvass `app/server/workspace-events-listen.server.ts` (`subscribeWorkspaceEventNotify`), quick-canvass `app/features/workspace-events/workspace-event-stream.shared.ts` (cursor serialization, reconnect backoff, poll intervals)
- _Considered_: WebSocket + Postgres LISTEN/NOTIFY (bidirectional, but all traffic is unidirectional server→client — WS only wins for live cursors/waveforms which don't exist here); hosted realtime via Ably/Pusher (adds vendor + recurring cost, contradicts exit spirit); polling (can't deliver sub-second agent-offer/wallboard UX the contact-center plan needs); Cloudflare DO/Workers WS (different runtime + vendor, contradicts Node consolidation); SSE + WS hybrid (WS for predictive-dial — but analysis showed broadcasts are low-frequency, unidirectional, resume-valuable, so SSE is strictly better)

#### ADR-0006: No DB-side behavior logic; Postgres is storage + concurrency only

No table triggers, no behavior logic in the DB. The one existing trigger (`transaction_history_update_credits`) becomes a Drizzle transaction: insert ledger row (idempotent, via `insertTransactionHistoryIdempotent` which returns `{ inserted: boolean }`), if `inserted === true` then `UPDATE workspace SET credits = credits + amount` with `SELECT FOR UPDATE` on the workspace row. NOTIFY is a signal primitive, not behavior — allowed from app code in the same transaction as a data write. Audit production for out-of-band triggers before cutover (the migration comment says the credits trigger "may already exist in production" — it was created out-of-band).

- _References_: `supabase/migrations/202606100001_billing_reconciliation_and_credits_trigger.sql:17` (the trigger — `create trigger transaction_history_update_credits after insert on public.transaction_history`), `supabase/migrations/202606100001_billing_reconciliation_and_credits_trigger.sql:3` (`returns trigger` function that does `update workspace set credits = coalesce(credits, 0) + new.amount`), `app/lib/transaction-history.server.ts:28` (`insertTransactionHistoryIdempotent` returns `{ inserted: boolean; existingId?: number }` — the `inserted` flag gates the credits update), `app/lib/transaction-history.server.ts:20` (idempotency key comment — "deterministic idempotency key stored in transaction_history table and enforced by a unique DB index/constraint")
- _Considered_: Keep the one trigger as an exception (erodes the ban posture — "why is this one here?"); derived credits via `SUM(amount)` on read (expensive — every API-key auth + billing page load runs a SUM query; no sync needed but bad performance)

#### ADR-0007: Generalized job table + Bun worker for long-run, cron, and DB-triggered work

One `job` table (`type` enum, `params jsonb`, `status`, `progress`, `claimed_until`, `claimed_by`, `idempotency_key` with unique index on `(type, idempotency_key)`, timestamps). Bun worker process (same codebase, different entry point) claims jobs via `FOR UPDATE SKIP LOCKED` — reusing the proven `claim_campaign_queue_contacts` pattern (ADR-0003). Worker-side scheduler with missed-cron catch-up on boot (any cron whose scheduled time passed while worker was offline gets a one-shot enqueue — strictly better than pg_cron which silently drops missed runs). LISTEN/NOTIFY bridge for event-driven enqueue: app-layer write calls `pg_notify()` in the same tx as the data write; worker `LISTEN`s and enqueues the matching job. Handler validates `params jsonb` with Zod. Replaces all Supabase Edge Functions for cron/long-run: exports, audience-upload, reconciliation, open-sync, number-rental-billing, campaign-dispatch, queue-next (predictive dialer), workspace-twilio-sync, audience-upload (Edge function version already exists at `supabase/functions/process-audience-upload/index.ts`).

- _References_: `app/lib/campaign-export.server.ts:260,525` (in-process export debt — `setTimeout(resolve, 500)` backoff, status checkpointed to Supabase Storage JSON), `app/lib/audience-upload-process.server.ts:264` (in-process upload debt — `setTimeout(resolve, 100)` backoff, fire-and-forget at `audience-upload.action.server.ts:172` `.catch(...)` no await), `supabase/migrations/20260521140000_queue_state_and_claim.sql:74` (claim pattern to reuse), `supabase/config.toml:152-170` (Edge functions to replace — `sms-status`, `ivr-status`, `ivr-recording`, `ivr-flow`, `acd-router`, `number-rental-billing`), `supabase/functions/queue-next/index.ts` (predictive dialer tick → worker job), `supabase/functions/process-audience-upload/index.ts` (Edge function version already exists — half-built migration path), pg_cron jobs: `twilio_open_sync_every_5m` (`supabase/migrations/20260414200000_twilio_open_sync_cron.sql:57`), `twilio_billing_reconcile_daily` (`supabase/migrations/20260610195000_billing_reconcile_cron_concurrency.sql:53`), `number_rental_billing_daily` (`supabase/migrations/202604140001_number_rental_billing_cron.sql:41`)
- _Considered_: Per-domain job tables (`export_job`, `audience_upload_job`, etc. — N near-identical claim/status/progress schemas and worker loops); absorb into Express (reintroduces in-process debt — exports lost on restart, can't scale horizontally); external serverless platform / CF Workers (new vendor, non-Node reintroduces dual-runtime); M4 plan as written (`export_job` table, keep processing in Express — smallest change but exports still tie up request handlers); BullMQ / node-cron library (more machinery than a TS array + job table, only worth it if you outgrow in-process array)

#### ADR-0008: Strangler-fig migration on the live app

Each v2 decision is adopted incrementally on the live callcaster repo, alongside the Supabase equivalent, until the Supabase surface is gone. Each step deploys green (testable and working). `callcaster-v2` repo stays a sandbox for prototyping — not the migration path. The end state is named and time-boxed so the interim doesn't drift.

**Execution order:**
0. **Bun.serve** — swap Express, single file (`server/index.js` → `server/index.ts`). Against Supabase Postgres (unchanged).
1. **Worker + job table** — move exports + audience-upload off in-process. Fixes "serious debt" first. Worker uses Supabase JS initially (calls existing claim RPCs via `.rpc()`).
2. **Drizzle adoption** — MCP-aided single-shot schema generation from live Supabase Postgres (user will provide MCP access), then strangler-fig query migration (173 files, one domain at a time). Both clients coexist against same DB (Drizzle via conn string, Supabase JS via PostgREST). `database.types.ts` stays until each domain's queries move.
3. **pg-realtime** — replace Supabase Realtime with SSE + LISTEN/NOTIFY, one feature at a time. Independent of Drizzle.
4. **Better Auth** — one-shot user migration + session invalidation (the one flag day). After Drizzle (auth-postgres needs Drizzle adapter).
5. **Twilio specials → Bun** — port 20 Deno tests to Vitest first (prerequisite, not cleanup), then move Edge functions to Bun routes. Point Twilio URLs at Bun, verify zero Edge traffic, delete Edge functions.
6. **Storage swap** — Supabase Storage → Railway Buckets (prod) / MinIO (dev). Migrate files, swap storage calls.
7. **Ban triggers** — remove credits trigger, replace with Drizzle tx. After Drizzle is sole data access layer (no Supabase JS bypassing app layer).
8. **Move Postgres to Railway** — dump/restore, change connection string. Last — all Supabase dependencies gone.

**Parallel tracks:** Steps 3-6 can partially parallelize (different surfaces). Steps 0-2 are sequential. Steps 7-8 are cleanup.

**Testing in v2:** PGlite for tests (in-memory, per test file, no Docker, instant startup, hermetic — each test file gets its own isolated Postgres, `drizzle-kit push` sets up schema). Docker Compose for local dev (`docker-compose.dev.yml` with Postgres 15 + MinIO + Inbucket; Bun dev server + Better Auth + pg-realtime + worker run natively, not in Docker). Railway Postgres for prod. Same Drizzle schema across all three. Drizzle has a PGlite adapter.

**Deno exit:** 20 Deno tests → Vitest (mechanical port: `Deno.test` → `describe/test`, `assertEquals` → `expect().toEqual()`). `supabase/functions/_shared/*.ts` → `shared/` (CallCaster-specific logic: IVR/SMS status, campaign dispatch, ACD, queue) + `@chester-hill-solutions/*` packages (genuinely reusable patterns: billing windows, HTTP response helpers). Drop Deno runner (`test:coverage:deno`, `typecheck:deno`), `deno.lock`, `deno` devDependency. Coverage gate simplifies to Vitest node + ui only — no Deno LCOV merge step.

**Database pruning (during MCP-aided schema generation):**

DROP vestigial tables (zero or near-zero app usage):
- `email`, `email_campaign` — zero app usage, email campaigns never built
- `audience_rule` — only used by `update_audience_membership` Edge fn (going away), conditional audiences never built into app
- `campaign_schedule_jobs` — only used by `create_schedule_jobs` Edge fn (going away)
- `twilio_cancellation_queue` — only used by `cancel_calls` Edge fn (going away)
- `workspace_permissions` — zero app usage, abandoned parallel to `workspace_users` role system
- `phone_verification` — legacy PIN-based 2FA (2 refs), verify it's not active before dropping

CONSOLIDATE:
- `live_campaign` + `ivr_campaign` + `message_campaign` → into `campaign` (type-gated nullable columns or `campaign_config jsonb`, validated by Zod per type). `email_campaign` drops entirely. Four tables → one. The `campaign` table already has a `type` enum (`campaign_type`). Eliminates "which type-specific table do I join?" complexity.
- `contact_audience` + `campaign_audience` — evaluate merge during MCP gen (likely stay separate — genuinely different relationships)

COMPLETE:
- `campaign_queue.status` normalization — drop the overloaded `status` column (stores lifecycle state `'queued'`/`'dequeued'`, UUID user assignment `status = assigned_to_user_id::text`, AND provider status strings in one field). Keep only `queue_state` + `assigned_to_user_id` + `provider_status`. Removes the UUID regex detection hack in `queue-status.ts` (`UUID_STATUS_PATTERN = /^[0-9a-f]{8}-.../i`). The normalization plan exists at `docs/queue-status-normalization-rollout.md` but is half-done.

PRUNE columns:
- `call`/`message` — SID→ID per ADR-0015, drop API noise (`account_sid`, `api_version`, `subresource_uris`, `uri`, `trunk_sid`, `group_sid`, `price`, `price_unit`)
- `workspace.users` array — duplicates `workspace_users` junction, can drift
- `user.activity` JSON — replaced by `agent_status` + `agent_status_event` (M1 plan), still written by `useSupabaseRoom` heartbeat
- `contact.carrier` — stale Twilio lookup data, verify no app reads
- `contact.address_id` — unclear purpose, verify no app reads
- `contact.fullname` — derived via `fullname()` RPC, compute in app layer
- `buffer-polyfill` — Bun has Buffer natively, drop shim + dep + build script

KEEP (verify during MCP gen):
- `workspace.key` — Twilio API Key for per-workspace Voice SDK tokens (ADR-0016)
- `workspace.token` — Twilio API Secret for per-workspace Voice SDK tokens (ADR-0016)
- `workspace.twilio_data` — JSON blob holding Twilio subaccount config, keep but type in Drizzle

INVESTIGATE during MCP gen:
- `workspace.token` / `workspace.key` — confirmed load-bearing (Voice SDK tokens), not vestigial
- `user.access_level` — possibly legacy global admin flag, `workspace_users.role` is the proper per-workspace role
- `user.organization` — references something by numeric ID, unclear

SURVEY subsystem:
- Keep in callcaster + extract to separate package/app over time (decouple from core schema). Has real app usage (public-facing route `survey+/$surveyId.tsx`, API routes, analytics integration, 6 tables, 25+ app refs). Not vestigial — product decision to keep but decouple.

KEEP (core, well-used): `workspace`, `campaign`, `campaign_queue`, `call` (pruned), `workspace_number`, `user` (migrates to Better Auth), `outreach_attempt`, `message` (pruned), `script`, `contact` (pruned), `audience`, `workspace_users`, `workspace_invite`, `contact_audience`, `campaign_audience`, `audience_upload`, `transaction_history`, `handset_session`, `workspace_api_key`, `webhook`, `agent_status`, `agent_status_event`, `inbound_queue`, `inbound_queue_member`, `inbound_queue_entry`, `verification_session`, survey tables (for now)

- _References_: `package.json:34` (`typecheck:deno`), `package.json:41` (`test:coverage:deno`), `package.json:130` (`deno` devDependency), `supabase/functions/_shared/` (20 modules to port), `supabase/functions/__tests__/` (20 Deno tests to port — `acd_router_test.ts`, `audience_upload_test.ts`, `campaign_dispatch_test.ts`, `ivr_flow_test.ts`, `ivr_status_logic_test.ts`, `number_rental_billing_test.ts`, `queue_sync_test.ts`, `queue_writes_test.ts`, `sms_handler_test.ts`, `sms_status_logic_test.ts`, `twilio_billing_reconcile_test.ts`, etc.), `app/lib/database.types.ts` (173 importing files), `app/lib/queue-status.ts:1-20` (overloaded status helper with `UUID_STATUS_PATTERN` regex hack), `docs/queue-status-normalization-rollout.md` (half-done normalization plan)
- _Considered_: Fork-and-rebuild in callcaster-v2 (can't stay green against live traffic + tests without a cutover cliff); big-bang Postgres move first (Supabase JS client breaks without PostgREST — would need to swap ALL 173 files simultaneously); strangler + one-shot Realtime cutover (coexisting realtime systems are too confusing — but analysis showed SSE can replace all 3 Realtime features incrementally)

#### ADR-0009: Twilio specials into Bun server; acd-router tick → worker

Twilio-webhook Edge functions (sms-status, ivr-status, ivr-recording, ivr-flow, acd-router) fold into Bun server as a distinct route subtree with signature-only auth (never touching session auth). acd-router's self-chaining tick logic → worker job via LISTEN/NOTIFY on `inbound_queue_entry` insert. Completes the IVR-consolidation the audit doc calls for — one IVR runtime, one auth model, one place to debug. Also consolidates: `sms-handler` (inbound SMS — app already has `api+/inbound-sms.action.server.ts`), `ivr-handler` (outbound IVR initiation — app already has `api+/initiate-ivr/route.tsx`), `workspace-twilio-sync` (→ worker job), `invite-user-by-email` (→ Better Auth invitation system), `dequeue_contacts`/`process_ivr` (legacy, removed with `user.activity` drop), `call-server` (dead "Hello world" stub, removed). The strangler step: point Twilio voice/status URLs at Bun routes, verify zero traffic to Edge, then delete Edge functions.

- _References_: `supabase/config.toml:152-170` (Edge functions with `verify_jwt = false`), `app/lib/twilio-webhook.server.ts` (existing `validateWorkspaceTwilioWebhook` — signature validation), `app/lib/twilio-workspace-credentials.ts:14` (workspace credential resolution), `docs/ivr-remix-vs-edge-audit.md` (consolidation already called for — "do not remove Remix `api+/ivr/*` or Edge `ivr-flow` until audit shows zero callers"), `app/routes/api+/inbound-sms.action.server.ts:114` (existing app-side inbound SMS with STOP/START handling), `app/routes/api+/initiate-ivr/route.tsx` (existing app-side IVR initiation), `app/twilio.server.ts` (existing `validateTwilioWebhook`, `shouldValidateTwilioWebhooks`)
- _Considered_: Separate Node process for Twilio specials (premature — worker already offloads long-run so Bun stays responsive; only worth it if production shows web traffic starving Twilio); separate non-Node runtime for Twilio (reintroduces dual-runtime duplication the IVR audit complains about — egress is moot on Railway)

#### ADR-0010: One-shot auth migration to Better Auth; keep custom API key auth

Export all users from Supabase `auth.users` (emails + bcrypt password hashes + metadata), import into Better Auth Drizzle tables (per `@chester-hill-solutions/auth-postgres` schema — `auth-schema.ts`, `drizzle-adapter.ts`, `schema.ts`, `plugins.ts`), preserving bcrypt hashes so users don't need to reset passwords. Cut over in one deploy: swap `verifyAuth` to Better Auth's `createSessionReader` (from `@chester-hill-solutions/auth-react-router` — `createRequireSessionUserId`, `createAuthLayoutLoader`), swap the session cookie, remove Supabase Auth calls. All existing sessions invalidate — users re-login once with the same credentials. The one flag day in the strangler-fig. Custom API key auth (sha256 + `timingSafeEqual`, workspace-scoped via `workspace_api_key` table) stays — Better Auth's API key plugin is user-scoped, not workspace-scoped, so it would require layering workspace logic on top anyway. The `test/api-auth.test.ts` suite (key parsing, hash mismatch, workspace mismatch, timing leaks) stays.

- _References_: `app/lib/platform-auth.server.ts:55` (`signInWithPassword`), `app/lib/platform-auth.server.ts:100` (`signUp`), `app/lib/platform-auth.server.ts:189` (`resetPasswordForEmail`), `app/lib/platform-auth.server.ts:208,293` (`updateUser`), `app/lib/api-auth.server.ts:5-18` (`createHash("sha256")`, `timingSafeEqual` — stays), `app/lib/api-auth.server.ts:146-155` (key hash lookup + compare), `app/lib/api-auth.server.ts:250` (`hashApiKeyForStorage`), `test/api-auth.test.ts` (API key test coverage — stays), `app/sessions.server.tsx` (theme cookie — trivial, can become localStorage), chs `packages/auth-postgres/` (Better Auth factory, session reader, Drizzle schema, plugins — ready), chs `packages/auth-postgres/src/auth-schema.ts` (Drizzle schema tables), chs `packages/auth-react-router/` (`createRequireSessionUserId`, `createAuthLayoutLoader` — ready), chs `packages/auth/` (redirects, cookies, origin config)
- _Considered_: Dual-auth period with both session stores (per-request complexity for weeks/months to avoid one re-login — bad trade for B2B); adopt Better Auth API key plugin (user-scoped, not workspace-scoped — loses existing test coverage + requires workspace layering); keep Supabase Auth permanently (contradicts "no Supabase whatsoever")

### Non-v2 ADRs (existing decisions formalized) — ADR-0011 through ADR-0018

#### ADR-0011: Twilio subaccount-per-workspace

Each workspace gets its own Twilio subaccount with its own auth token, stored in `workspace.twilio_data` JSON blob. Webhook signatures validated per-workspace using the subaccount auth token, not the main account token. Dev/test fallback to main account token (`TWILIO_AUTH_TOKEN`) in non-production. Production fail-closed: missing workspace credentials yield no auth token; webhook validation fails (403 or 500). CallSid vs MessageSid asymmetry: CallSid webhooks may validate against main account token in non-production when no `call` row exists yet; MessageSid webhooks fail closed when no `message` row exists (inbound SMS must attribute workspace before persisting).

- _References_: `app/lib/twilio-workspace-credentials.ts:14` ("Parse workspace.twilio_data JSON for Twilio REST clients and webhook validation. Uses workspace/subaccount credentials when present; main account token only in development."), `app/lib/twilio-webhook.server.ts:192,260,298` (workspace auth token resolution), `docs/twilio-webhook-auth.md` (full credential policy), `app/twilio.server.ts` (`shouldValidateTwilioWebhooks` toggle, `validateTwilioWebhook`, `validateTwilioWebhookParams`)
- _Considered_: Single Twilio account for all workspaces (simpler but no billing isolation, no per-workspace webhook auth)

#### ADR-0012: Conference-per-call bridging

Outbound campaign calls bridge via Twilio `<Conference>` (not direct `<Dial>` to the agent) to enable supervisor listen/whisper/barge (Twilio conference participant `coach`/`muted` flags) and multi-leg bridge-failure recovery. Conferences are named per-user today (`{user_id}`); the ACD plan extends to `acd-{queueEntryId}` for inbound. Costs more Twilio resources than direct Dial; enables the contact-center supervisor milestone (M3).

- _References_: `app/routes/api+/auto-dial/$roomId.action.server.ts:131` (`addToConference` function), `app/routes/api+/auto-dial/$roomId.action.server.ts:138` (`endConferenceOnExit: false`), `app/lib/auto-dial.server.ts:107` (`completeAllConferences`), `app/routes/api+/auto-dial/status.action.server.ts:264,286` (conference status callback handling)
- _Considered_: Direct `<Dial>` to agent (cheaper, but no supervisor coaching, no multi-leg recovery)

#### ADR-0013: Roll-your-own ACD on Twilio Queues + Conferences, not TaskRouter

Inbound ACD built on Twilio Voice Queues + conference-per-entry (`acd-{queueEntryId}`) + a self-chaining router tick (DB-webhook-triggered, 1s self-chain while entries wait, modeled on `queue-next` campaign dispatch). Avoids Twilio TaskRouter's per-task pricing, second source of truth, and webhook surface that duplicates what `campaign_queue` + the queue-next tick pattern already prove out. Supabase Postgres is the single source of truth for queue entries and agent state; Supabase Realtime (→ pg-realtime in v2) drives the agent desktop and wallboard.

- _References_: `docs/contact-center-platform-plan.md:19-23` (decision documented — "roll our own ACD on Twilio Queues + Conferences (not TaskRouter)"), `supabase/migrations/20260610215000_inbound_queue_routing.sql:199` (`claim_inbound_queue_entry` RPC), `supabase/migrations/20260610215000_inbound_queue_routing.sql:253` (`release_inbound_offer` RPC), `supabase/functions/acd-router/index.ts` (Edge function — moves to worker in v2 per ADR-0009), `docs/contact-center-platform-plan.md:96-106` (call flow: enqueue → wait loop → router tick → offer → bridge → hangup)
- _Considered_: Twilio TaskRouter (per-task pricing, second source of truth, webhook surface duplication)

#### ADR-0014: Doc-first OpenAPI (hand-authored spec)

The OpenAPI spec is hand-authored in code from an `ApiSurfaceEntry` list (`buildOpenApiSpec`), not generated from route annotations or reflection. Hand-written Zod schemas in `app/lib/schemas/api/` complement the generated SDK for rules OpenAPI cannot express (e.g., script XOR). Trade-off: maintenance burden (spec can drift from routes if not updated) vs. control (hide internal routes, tag by auth class, document only what's supported, mark unsupported routes with `x-callcaster-supported: false`). Two specs served: public (`/api/docs/openapi`) and complete (`/api/docs/openapi/all`).

- _References_: `app/lib/openapi-build.ts:210` (`buildOpenApiSpec` — iterates `options.entries`, builds `paths` record), `app/lib/openapi-build.ts:174` (`operationId` function), `app/lib/openapi-build.ts:200` (`tagsForEntry` — owner area + auth class), `app/lib/schemas/api/` (hand-written Zod: `actions.ts`, `campaigns.ts`, `chat-sms.ts`, `common.ts`, `create-with-script.ts`, `numbers-search.ts`, `platform-analytics.ts`, `platform-auth.ts`, `platform-billing.ts`, `platform-data.ts`), `app/lib/api-generated/` (generated SDK: `client.gen.ts`, `sdk.gen.ts`, `types.gen.ts`, `zod.gen.ts`), `openapi-ts.config.ts` (Hey API codegen config), `docs/api-overview.md`, `app/lib/openapi.ts` (spec served at `/api/docs/openapi`)
- _Considered_: Annotation-generated OpenAPI (less control over what's documented/hidden/tagged)

#### ADR-0015: Domain IDs as PK, Twilio SIDs as correlation columns

`call` and `message` tables get a domain `id` (auto-increment) as primary key; `twilio_sid` becomes a nullable indexed column for webhook correlation and idempotency keys. Drop Twilio API noise columns: `account_sid`, `api_version`, `subresource_uris`, `uri`, `trunk_sid`, `group_sid`, `price`, `price_unit`. `parent_call_sid` → `parent_call_id` (FK to own `call.id`). `inbound_queue_entry.call_sid` → `call_id` FK. Keep domain-relevant fields: `twilio_sid`, `from`, `to`, `direction`, `status`, `duration`, `error_code`, `error_message`, `recording_url`, `recording_sid`, `conference_id`, `campaign_id`, `contact_id`, `workspace`, `outreach_attempt_id`. Backfill migration maps old SIDs to new IDs. Idempotency keys (`call:<CallSid>`, `sms:<MessageSid>`) continue to use Twilio SIDs — that's the deduplication dimension (Twilio retries deliver the same SID).

- _References_: `app/lib/database.types.ts` (call table: `sid: string` as PK, plus `account_sid`, `api_version`, `parent_call_sid`, `phone_number_sid`, `trunk_sid`, `group_sid`, `subresource_uris`, `uri`, `price`, `price_unit` — Twilio API dump), `app/lib/database.types.ts` (message table: `sid: string` as PK, plus `account_sid`, `api_version`, `messaging_service_sid` — same vendor dump), `app/lib/campaign-billing.server.ts:58` (idempotency keys using SIDs: `` `call:${row.sid}` ``, `` `sms:${row.sid}` ``), `supabase/migrations/202606100001_billing_reconciliation_and_credits_trigger.sql` (idempotency key patterns: `sms:<MessageSid>`, `call:<CallSid>`, `number_rent:<workspaceId>:<numberSid>`, `stripe_evt:<eventId>`)
- _Considered_: Keep sid as PK, drop noise columns only (keeps vendor identifier as primary key — core of "unwieldy" debt remains); leave call/message tables as-is (works, but SID-as-PK coupling is the debt)

#### ADR-0016: Per-workspace Twilio Voice SDK tokens

Browser calling devices get capability tokens scoped to the workspace's Twilio subaccount (API key + secret from `workspace.twilio_data`/`workspace.key`/`workspace.token`), not the main account credentials. Pairs with ADR-0011 (subaccount-per-workspace) but is a distinct decision about token minting for the Voice SDK.

- _References_: `app/routes/api+/token.loader.server.ts:30-51` (fetches `workspace.twilio_data, key, token`, extracts `twilioAccountSid`, `twilioApiKey` (from `key`), `twilioApiSecret` (from `token`), calls `generateToken`), `app/routes/api+/handset-token.loader.server.ts:33-36` (`createHandsetAccessToken`), `app/lib/twilio-token.server.ts` (`generateToken` function), `app/lib/types.ts` (`TwilioAccountData` type with `sid`, `authToken`, `portalConfig`, `portalSync`, `onboarding`)
- _Considered_: Main account credentials for all Voice SDK tokens (simpler but no per-workspace isolation)

#### ADR-0017: Per-workspace throughput config derived from Twilio sender class

SMS messages-per-second, voice calls-per-second, concurrent call limits, and parallel dispatch are per-workspace (stored in `workspace.twilio_data.portalConfig`), with sender-class-aware defaults: short code = 100 MPS, verified toll-free = 3 MPS, local = 1 MPS, US A2P 10DLC = 1 MPS. Different Twilio number types have different carrier rate limits; a global config would break carrier compliance.

- _References_: `supabase/functions/_shared/throughput-config.ts` (`TwilioSmsSenderClass` type: `unknown | ca_local | verified_toll_free | ca_short_code | us_a2p10dlc`, `WorkspaceThroughputPortalConfig` type: `smsSenderClass`, `smsTargetMps`, `voiceTargetCps`, `voiceConcurrentCallLimit`, `parallelDispatchEnabled`, `defaultSmsTargetMps` function with sender-class-aware defaults), `supabase/functions/_shared/queue-policy.ts` (`DISPATCH_TICK_MS = 1000`, `MAX_QUEUE_ATTEMPTS = 5`, `STALE_CLAIM_TIMEOUT_MS = 10 * 60 * 1000`, `LEGACY_QUEUE_DELAY_MS = 200`), `app/lib/database/workspace-twilio-portal-snapshot.server.ts:55-59` (`legacyDispatcherSmsMps`, `configuredDispatcherSmsMps`, `legacyDispatcherVoiceCps`, `configuredDispatcherVoiceCps`)
- _Considered_: Global throughput config (breaks carrier compliance — different number types have different rate limits)

#### ADR-0018: Public API as platform boundary

CallCaster's public API (`/api/*` routes) is a stable integration surface consumed by other chester-hill apps (notably Adagio) via the `@chester-hill-solutions/scriptkit-callcaster-client` HTTP client. v2 changes must preserve backward compatibility for these consumers. The API contract is the integration surface, not the DB schema — internal schema changes (ADR-0015, table pruning) don't break consumers as long as the API shape is maintained. The client supports both API key auth (`cc_live_…`) and agent JWT auth.

- _References_: chs `packages/scriptkit-callcaster-client/` (`createCallCasterClient` HTTP client), chs `packages/scriptkit-callcaster-client/README.md` (usage: `authenticateAgent()`, `createWorkspace()`, `createApiKey()`, `createCampaignWithScript()`, `sendChatSms()`, `sendSms()`, `listAudiences()`, `uploadAudience()`), chs `docs/reference/callcaster-provision-api.md` (API reference — "Types align with CallCaster `/api/*` routes (not fictional `/v1/*`)"), `app/lib/openapi.ts` (spec served at `/api/docs/openapi`), `app/lib/api-surface.ts` (complete route inventory)
- _Considered_: Not formalizing (already documented in chs docs, but the boundary constraint on v2 changes is not visible from CallCaster's own repo)

---

## What v2 accomplishes (20 capabilities + debt eliminations)

### New capabilities
1. **Horizontal scaling** — worker (ADR-0007) + stateless Bun (ADR-0001) = multiple web instances behind a load balancer. Worker handles all long-run work; web tier is pure request/response.
2. **M3/M4 unblock** — worker + job table is literally the M4 prerequisite (`docs/contact-center-platform-plan.md:16` says exports are "fire-and-forget in-process, lost on process restart"). pg-realtime (ADR-0005) provides sub-second wallboard push that M3 needs — Supabase Realtime's presence doesn't even `track()` today.
3. **IVR runtime consolidation** — one runtime, one auth model (completes `docs/ivr-remix-vs-edge-audit.md`'s call for consolidation).
4. **Type safety end-to-end** — Drizzle `InferSelectModel`/`InferInsertModel`, typed `Json` columns via Zod. Compiler catches data-shape bugs that currently only surface at runtime.
5. **Test hermeticism** — PGlite in-memory per test file, no Docker, instant startup, real DB behavior instead of mocks that drift from reality.
6. **Realtime that works** — cursor-resumed SSE so reconnects don't lose events, proper presence via event transitions, no lost broadcasts. Today Supabase Realtime presence is subscribed but never `track()`ed; broadcasts lost on reconnect.
7. **Reliable outbound webhooks** — fired from the `workspace_events` event log, not opaque Edge functions. One event source, multiple consumers (realtime UI + outbound webhooks).
8. **Predictive dialer gets a proper home** — `queue-next` becomes a worker job with visibility, testability, and independent scaling — not an opaque Edge function.
9. **Durable campaign scheduling** — worker scheduler with missed-cron catch-up. Campaigns start/stop at scheduled times reliably, with no missed schedules if the worker restarts.
10. **Admin portal gets real data** — live job table metrics instead of "legacy pipeline" display.
11. **DB branching for safe migrations** — Railway Postgres branching per strangler step, test against full-data copy before touching prod.
12. **callcaster-v2 sandbox** — prototyping space for v2 components without touching production.
13. **Cross-app event sharing** — `@chester-hill-solutions/pg-realtime` enables SSE event bus across chs apps. Campaign completion event in CallCaster could trigger a workflow in another app.
14. **Shed Supabase SDK entirely** — no PostgREST HTTP hop (direct Postgres wire protocol via `postgres` driver — faster), smaller browser bundle (no `@supabase/ssr`), one less SDK in the dependency tree.
15. **User invitations via auth framework** — Better Auth's invitation system, not custom `invite-user-by-email` Edge function.
16. **Inbound SMS consolidation** — one handler in Bun, testable with Vitest, no Deno/Node duplication.
17. **IVR initiation consolidation** — one path, no dual-runtime confusion.
18. **Twilio sync as observable worker job** — progress, retry, visibility in job table.
19. **Dead code removal** — `call-server` stub, legacy `dequeue_contacts`/`process_ivr`.
20. **Queue status normalization completed** — no more UUID-in-status-field hack.

### Debt eliminated (16 items)
| Debt | Today | v2 |
|---|---|---|
| In-process exports lost on restart | `campaign-export.server.ts` fire-and-forget | Worker + job table (ADR-0007) |
| In-process audience-upload lost on restart | `audience-upload-process.server.ts` fire-and-forget | Worker + job table |
| Dual IVR runtime (Remix + Edge) | Two codepaths, unknown production traffic | One Bun runtime (ADR-0009) |
| `campaign_queue.status` overloaded | UUID regex detection hack in `queue-status.ts` | Completed normalization, 3 clean columns |
| `call`/`message` tables keyed by Twilio SID | Vendor owns your data model | Domain ID as PK, SID as correlation (ADR-0015) |
| `database.types.ts` (3,093 lines) | 173 files depend on Supabase-generated types | Deleted — Drizzle schema is source of truth |
| Deno/Node dual runtime | 20 Deno tests, `_shared/` duplicating app logic | One runtime, one test runner, `_shared/` → `shared/` |
| RLS policies (hard to test) | Defense-in-depth but untestable | Scoped Drizzle client, testable (ADR-0004) |
| Credits trigger (invisible, untestable) | `transaction_history_update_credits` | Drizzle transaction, testable (ADR-0006) |
| 7 vestigial tables | email, email_campaign, audience_rule, campaign_schedule_jobs, twilio_cancellation_queue, workspace_permissions, phone_verification | Dropped |
| 4 campaign type tables | live_campaign, ivr_campaign, message_campaign, email_campaign | Consolidated into `campaign` |
| Twilio API noise columns | account_sid, api_version, subresource_uris, uri, trunk_sid, group_sid | Dropped |
| `workspace.users` array | Duplicates `workspace_users` junction | Dropped |
| `user.activity` JSON heartbeat | Replaced by `agent_status` but still written | Dropped |
| Buffer polyfill | Browser compat shim for Node Buffer | Dropped (Bun has Buffer natively) |
| Express + 4 middleware deps | express, compression, cookie-parser, morgan | Dropped (Bun.serve) |

### Costs (honest trade-offs)
| Cost | Mitigation |
|---|---|
| Strangler-fig interim: two data layers (Supabase JS + Drizzle) coexist | Time-boxed; each domain migrates independently; end state named in ADR-0008 |
| One auth flag day: all sessions invalidate | Bcrypt hash preservation — users re-login with same credentials; scheduled low-traffic window |
| Deno tests must port before Edge deletion | Mechanical port; prerequisite for ADR-0009, not cleanup |
| Twilio webhook availability depends on Bun tier | Worker offloads long-run; Bun stays responsive; Railway auto-restart |
| Per-workspace scoped client bug = cross-tenant leak | Scoped client is only exported tenant accessor; admin client not importable from routes; integration tests assert isolation |
| pg-realtime is a new shared package to maintain | Extracted from proven quick-canvass pattern; shared across chs apps; contributes back |

### Out of scope
- Blended agents (outbound + inbound simultaneously) — still exclusive at launch per contact-center plan
- Callback-instead-of-holding for ACD — M1 plan explicitly defers
- Multi-segment SMS billing — noted as non-blocker in `docs/billing-source-of-truth.md`
- Campaign cost estimates — UI transparency, not billing correctness
- Manual shift-adjustment tooling — M4 plan defers
- Extending supervisor monitoring to outbound campaign conferences — M3 plan says follow-up

---

## CONTEXT.md (to be created at repo root)

Domain glossary — created lazily alongside the first ADR. Terms to include:

- **Workspace**: A tenant organization. Owns campaigns, contacts, numbers, scripts, credits. Has members (users with roles: owner, admin, member, caller).
- **Campaign**: A dialing/messaging effort against an audience. Types: live_call, ivr, message. Has a script, caller ID, queue, schedule.
- **Script**: A pages/blocks JSON document defining the call flow. Stored in `script` table, engine in `@chester-hill-solutions/scriptkit-call-script-core`.
- **Audience**: A collection of contacts targeted by a campaign. Uploaded via CSV.
- **Contact**: A person with phone/email/address. Belongs to a workspace. Has `opt_out` flag.
- **Queue Entry**: A row in `campaign_queue` representing a contact queued for dialing. Has lifecycle: queued → assigned → dequeued/canceled.
- **Agent Status**: A per-workspace-per-user row (`agent_status`) tracking availability: offline, available, busy, wrap_up, away. Authoritative routing input for ACD.
- **ACD**: Automatic Call Distribution — inbound call routing to available agents via queues.
- **Inbound Queue**: A configured queue for inbound calls with ring strategy, business hours, overflow.
- **Credits**: Prepaid balance on a workspace. Debited per SMS segment, voice minute, number rental. Synced from `transaction_history` ledger.
- **Ledger**: `transaction_history` table — append-only, idempotent (unique on `idempotency_key`). Credits trigger (→ Drizzle tx in v2) keeps `workspace.credits` in sync.
- **Workspace Number**: A phone number owned by a workspace. Can be rented (monthly billing) or external. Has inbound action config.
- **Outreach Attempt**: A single attempt to reach a contact (call or SMS). Has disposition, result, timestamps.
- **Handset Session**: A browser calling session for an agent. Newest wins (takeover model).
- **Twilio Subaccount**: Per-workspace Twilio account isolation. Credentials in `workspace.twilio_data`.

---

## Security note (NOT an ADR — for remediation)

`app/transcribe.json` contains a committed GCP service account private key (live credential for `transcriptor@euphoric-axon-421918.iam.gserviceaccount.com`). User is aware. Remediation: rotate the key in GCP console, remove the file from the repo, purge from git history, move credentials to an env var.

---

## Package inventory (existing chs packages available for reuse)

From `../chester-hill-solutions/packages/`:
- **`@chester-hill-solutions/auth`** — framework-agnostic auth utilities (redirects, cookies, origin config, session types, postgres actor)
- **`@chester-hill-solutions/auth-postgres`** — Better Auth factory, session reader, Drizzle schema, plugins for Postgres. **READY for v2 auth.**
- **`@chester-hill-solutions/auth-react-router`** — React Router 7 auth guards (`createRequireSessionUserId`, `createAuthLayoutLoader`). **READY.**
- **`@chester-hill-solutions/cms-store-postgres`** — Postgres + S3-compatible media adapter (`createCmsStorePostgres`, `createS3MediaStore`). Pattern for v2 storage.
- **`@chester-hill-solutions/cms-core`** — CMS pageDoc block schemas, block factory, validation
- **`@chester-hill-solutions/cms-react`** — React CMS components
- **`@chester-hill-solutions/scriptkit-call-script-core`** — Call script schemas, validation, migration, routing, merge tags. **Already used by callcaster.**
- **`@chester-hill-solutions/scriptkit-call-script-react`** — React editor and runner for call scripts. **Already used.**
- **`@chester-hill-solutions/scriptkit-callcaster-client`** — HTTP client for CallCaster API. **Consumed by other chs apps (Adagio).**
- **`@chester-hill-solutions/validation`** — Canadian input normalization and Zod schemas
- **`@chester-hill-solutions/http`** — Fetch Response helpers and request parsing utilities
- **`@chester-hill-solutions/errors`** — Generic user-facing error formatters
- **`@chester-hill-solutions/datetime`**, **`search-params`**, **`sort`** — utility packages

**To be created:**
- **`@chester-hill-solutions/pg-realtime`** — SSE + workspace_events + LISTEN/NOTIFY realtime package (extracted from quick-canvass pattern per ADR-0005)

---

## Edge functions inventory (22 total — all to be migrated or removed in v2)

### Cron / long-run / DB-triggered → Bun worker (ADR-0007)
| Function | Purpose | v2 fate |
|---|---|---|
| `twilio-open-sync` | Pull stale call/message statuses from Twilio REST (pg_cron 5m) | Worker job `twilio_open_sync` |
| `twilio-billing-reconcile` | Nightly variance report (pg_cron 04:30 UTC) | Worker job `twilio_billing_reconcile` |
| `number-rental-billing` | Monthly renewal sweep, reminders, auto-release (pg_cron 03:15 UTC) | Worker job `number_rental_billing` |
| `campaign-dispatch` | Campaign queue dispatch | Worker job `campaign_dispatch` |
| `queue-next` | Predictive dialer tick (self-chaining) | Worker job `queue_next` |
| `process-audience-upload` | CSV ingestion (Edge version already exists) | Worker job `audience_upload` (replaces in-process `audience-upload-process.server.ts`) |
| `update_queue_by_campaign_audience` | Sync queue when audience changes | Worker job `queue_sync` |
| `workspace-twilio-sync` | Pull Twilio account status/usage | Worker job `workspace_twilio_sync` |
| `create_schedule_jobs` | Campaign start/stop scheduling | Worker scheduler (drop `campaign_schedule_jobs` table) |

### Twilio-webhook-facing → Bun routes (ADR-0009)
| Function | Purpose | v2 fate |
|---|---|---|
| `sms-status` | SMS terminal status callback | Bun route `api+/sms/status` (already exists) |
| `ivr-status` | IVR call status callback | Bun route `api+/ivr/status` (already exists) |
| `ivr-recording` | IVR recording callback | Bun route `api+/ivr/recording` |
| `ivr-flow` | IVR in-call flow (TwiML) | Bun route `api+/ivr/*` (already exists) |
| `acd-router` | ACD router (TwiML + tick) | Bun routes (TwiML) + worker job (tick) |

### Consolidate into existing app routes (ADR-0009)
| Function | Purpose | v2 fate |
|---|---|---|
| `sms-handler` | Inbound SMS processing | Consolidate with `api+/inbound-sms.action.server.ts` |
| `ivr-handler` | Outbound IVR initiation | Consolidate with `api+/initiate-ivr/route.tsx` |
| `invite-user-by-email` | User invitation | Better Auth invitation system |
| `handle_active_change` | Campaign active/inactive webhook | Bun route + worker |

### Remove (dead/legacy)
| Function | Purpose | v2 fate |
|---|---|---|
| `call-server` | "Hello world" stub | Removed (dead code) |
| `dequeue_contacts` | Legacy session expiry (uses `get_last_online` RPC) | Removed (with `user.activity` drop) |
| `process-ivr` | Legacy batch IVR (`process_ivr_tasks` RPC) | Removed (legacy) |
| `cancel_calls` | Twilio cancellation queue | Removed (with `twilio_cancellation_queue` table drop) |
| `outreach-attempt-hook` | Outbound webhook on outreach attempt | Worker job `outreach_attempt_webhook` or event log consumer |

### `_shared/` modules → `shared/` + chs packages (ADR-0008)
| Module | v2 home |
|---|---|
| `ivr-status-logic.ts` | `shared/` (CallCaster-specific) |
| `sms-status-logic.ts` | `shared/` (CallCaster-specific) |
| `campaign-dispatch.ts` | `shared/` (CallCaster-specific) |
| `acd-router.ts` | `shared/` (CallCaster-specific) |
| `acd-utils.ts` | `shared/` (CallCaster-specific) |
| `queue-sync.ts` | `shared/` (CallCaster-specific) |
| `queue-writes.ts` | `shared/` (CallCaster-specific) |
| `queue-policy.ts` | `shared/` (CallCaster-specific) |
| `audience-upload.ts` | `shared/` (CallCaster-specific) |
| `portal-config.ts` | `shared/` (CallCaster-specific) |
| `sms-send-resolve.ts` | `shared/` (CallCaster-specific) |
| `twilio-open-sync-candidates.ts` | `shared/` (CallCaster-specific) |
| `call-provider-status.ts` | `shared/` (CallCaster-specific) |
| `billing-reconcile-request.ts` | chs packages (reusable pattern) |
| `handler-response.ts` | chs packages (HTTP response helpers) |
| `getFunctionHeaders.ts` | Removed (Edge-specific) |
| `getFunctionsBaseUrl.ts` | Removed (Edge-specific) |
| `throughput-config.ts` | `shared/` (CallCaster-specific) |
| `twilio-workspace-credentials.ts` | `shared/` (already has app-side equivalent) |
| `number-rental-billing.ts` | chs packages (billing date/window logic — reusable) |

---

## Table inventory (42 tables — pruning assessment)

### DROP (vestigial, 7 tables)
| Table | App refs | Why |
|---|---|---|
| `email` | 0 | Zero app usage, email campaigns never built |
| `email_campaign` | 0 | Zero app usage |
| `audience_rule` | 0 (1 Edge fn) | Only `update_audience_membership` Edge fn (going away) |
| `campaign_schedule_jobs` | 0 (1 Edge fn) | Only `create_schedule_jobs` Edge fn (going away) |
| `twilio_cancellation_queue` | 0 (1 Edge fn) | Only `cancel_calls` Edge fn (going away) |
| `workspace_permissions` | 0 | Abandoned parallel to `workspace_users` |
| `phone_verification` | 2 | Legacy PIN 2FA — verify not active before dropping |

### CONSOLIDATE (4 tables → 1)
| Tables | Action |
|---|---|
| `live_campaign` + `ivr_campaign` + `message_campaign` + `email_campaign` | → into `campaign` (type-gated columns). `email_campaign` drops. |

### COMPLETE normalization
| Table | Action |
|---|---|
| `campaign_queue` | Drop overloaded `status` column. Keep `queue_state` + `assigned_to_user_id` + `provider_status`. |

### PRUNE columns
| Table | Columns to drop |
|---|---|
| `call` | `account_sid`, `api_version`, `subresource_uris`, `uri`, `trunk_sid`, `group_sid`, `price`, `price_unit`. `sid` → `id` (PK) + `twilio_sid` (correlation). `parent_call_sid` → `parent_call_id`. |
| `message` | Same treatment as `call`. |
| `workspace` | `users` array (duplicates `workspace_users`). KEEP `key`, `token` (Twilio API Key/Secret for Voice SDK). |
| `user` | `activity` (replaced by `agent_status`). |
| `contact` | `carrier`, `address_id`, `fullname` (vestigial/derived). |
| `inbound_queue_entry` | `call_sid` → `call_id` FK (after call table SID→ID). |

### KEEP (core, 28+ tables)
`workspace`, `campaign`, `campaign_queue`, `call` (pruned), `workspace_number`, `user` (→ Better Auth), `outreach_attempt`, `message` (pruned), `script`, `contact` (pruned), `audience`, `workspace_users`, `workspace_invite`, `contact_audience`, `campaign_audience`, `audience_upload`, `transaction_history`, `handset_session`, `workspace_api_key`, `webhook`, `agent_status`, `agent_status_event`, `inbound_queue`, `inbound_queue_member`, `inbound_queue_entry` (pruned), `verification_session`, `survey` + `survey_page` + `survey_question` + `question_option` + `survey_response` + `response_answer` (keep + extract to package/app over time)

### NEW (live transcription + coaching, ADR-0027-0030)
`transcript_segment` (one row per Deepgram utterance, FK→call.id), `coaching_event` (filler_burst/pace/pause/suggestion, FK→call.id), `coaching_session` (per-call summary with WPM/filler/pause/score, FK→call.id unique), `call_transcript` (live Deepgram + batch Cohere, FK→call.id unique). `call` gains `audio_url` (Railway Buckets path), `transcript_id` (FK→call_transcript.id), `coaching_session_id` (FK→coaching_session.id). `workspace` gains `feature_flags` (Zod-typed jsonb: `{liveTranscription, liveCoaching}`) and `coaching_config` (Zod-typed jsonb: filler words, WPM range, pause threshold, LLM cadence, persona, disclosure toggle). See [docs/live-transcription-coaching-plan.md](live-transcription-coaching-plan.md) for the full implementation plan.

---

## Additional findings (post-reference-doc, pre-compaction)

### Two parallel permission systems (confirms pruning)
- `workspace_role` enum: `owner | member | caller | admin` — active, used in `workspace_users`
- `workspace_permission` enum: 24 fine-grained permissions (`workspace.delete`, `workspace.addUser`, etc.) — the `workspace_permissions` table using these has ZERO app usage. Confirms drop decision.
- _References_: `app/lib/database.types.ts:2984` (`workspace_role`), `app/lib/database.types.ts:2959-2983` (`workspace_permission` — 24 values)

### Campaign type enum has 6 values (not 4)
`campaign_type`: `message | robocall | simple_ivr | complex_ivr | live_call | email`. The consolidation (ADR-0008) folds the type-specific tables into `campaign`, but the enum itself needs cleanup: `email` drops (email campaigns never built), `robocall` vs `simple_ivr` vs `complex_ivr` may need rationalization.
- _References_: `app/lib/database.types.ts:2931-2937`

### CI coverage gate runs in default mode (not strict)
`.github/workflows/ci.yml` runs `test:coverage` with `COVERAGE_FULL: "0"` — fails on missing files but does NOT enforce 100% lines/branches/functions. Strict mode (`COVERAGE_FULL=1`) exists but is not CI-enforced. v2 should decide whether to enforce strict in CI.
- _References_: `.github/workflows/ci.yml:42` (`COVERAGE_FULL: "0"`), `scripts/coverage/merge-and-check.mjs` (default vs strict mode), `docs/testing-map.md` (coverage gate documentation)

### Onboarding is a multi-step wizard with messaging service setup
`app/routes/workspaces+/$id/onboarding/` has a full wizard: BusinessBasics, Channels, FirstNumber, MessagingService, ProviderActions, Launch. The messaging onboarding state machine lives in `app/lib/messaging-onboarding/` (defaults, merge, normalize, persistence, readiness). Not ADR-worthy — it's a feature, not an architecture decision.

### Stripe customer = workspace, not user
`createStripeContact` (`app/lib/database/stripe.server.ts`) creates a Stripe customer from the workspace owner's email and stores `stripe_id` on the `workspace` row. Checkout sessions are customer-scoped. Standard Stripe pattern, not ADR-worthy.

### shared/ directory already established
`shared/` has 7 files: `pricing.ts`, `billing-reconciliation.ts`, `campaign-billing.ts`, `twilio-retry-predicates.ts`, `workspace-analytics.ts`, `call-log.ts`, `inbound-rings.ts`. All are cross-process logic shared between app and Edge functions. Confirms ADR-0008's `_shared/` → `shared/` migration target — the pattern is already established.

### Error handling is a 4-rule guideline, not an ADR
`docs/error-handling.md` has 4 rules: log + return/throw explicit errors, surface errors in client hooks, avoid fire-and-forget async, document lazy runtime-only imports. Coding standard, not architecture decision.

---

## Grilling decisions log (for reference)

| Q | Topic | Decision |
|---|---|---|
| Q1 | Runtime/deployment | Express → Bun.serve (step 0). Railway is deployment target. Serverless never considered for app tier. |
| Q2 | Long-run work target | Separate Node worker on Railway (same codebase, different CMD). |
| Q2-scope | Edge exit scope | Cron/long-run/DB-triggered functions migrate off Deno. Twilio-webhook-facing functions stay (later moved to Bun in ADR-0009). |
| Q3 | Job table | One generalized `job` table with `type` enum + `params jsonb` + idempotency key unique index. |
| Q4 | No Supabase scope | Keep Postgres-the-DB (hosted off Supabase on Railway), shed Supabase-the-product. Drizzle ORM + postgres driver. |
| Q5 | RPC + claim/lease | Hybrid: Drizzle CRUD + plpgsql RPCs for concurrency (`FOR UPDATE SKIP LOCKED`). |
| Q6 | Tenant isolation | Scoped Drizzle client (`createTenantDb`), no RLS. |
| Q7 | Realtime | Pure SSE + workspace_events + LISTEN/NOTIFY (pg-realtime package). NOT WebSocket hybrid. |
| Q7-trigger | Trigger debt | Ban triggers + DB behavior logic. Postgres is storage + concurrency only. |
| Q8 | Scheduler | Worker-side scheduler + LISTEN/NOTIFY bridge. No pg_cron. |
| Q9 | Migration strategy | Strangler-fig on live app. Not fork-and-rebuild. |
| Q10 | Twilio specials | Fold into Bun as distinct route boundary. acd-router tick → worker. |
| Q11 | Postgres hosting | Railway Postgres (branchable). |
| Q12 | Credits sync | Drizzle tx: ledger insert + credits update gated on `inserted`, with `SELECT FOR UPDATE`. |
| Q13 | Auth migration | One-shot user migration + session invalidation. Bcrypt hashes preserved. |
| Q14 | Object storage | Railway Buckets (prod), MinIO (dev). S3-compatible via `createS3MediaStore` pattern. |
| Q15 | Job table (confirmed) | One generalized job table + idempotency index. |
| Q16 | Strangler order | Reordered: worker first (fixes serious debt), then Drizzle, parallel middle, Postgres move last. |
| Q17 | Schema migration | MCP-aided single-shot schema generation, then strangler-fig query migration. |
| Q18 | Testing | Port 20 Deno tests to Vitest, drop Deno entirely. PGlite for tests, Docker for dev. |
| Q19 | Local dev | Docker Compose (Postgres 15 + MinIO + Inbucket). Bun dev server runs natively. |
| Q20 | API key auth | Keep custom (sha256 + timingSafeEqual, workspace-scoped). Better Auth replaces session auth only. |
| Q21 | Doc-first OpenAPI | ADR-0014. |
| SID | SID pruning | Domain IDs as PK, twilio_sid as correlation. Drop API noise. (ADR-0015) |
| DB pruning | Table pruning | Drop 7 vestigial, consolidate 4 campaign type tables, complete queue status normalization, prune columns. |
| Survey | Survey fate | Keep + extract to separate package/app over time. |
| Contact | Contact cleanup | Drop carrier, address_id, fullname. |
| Workspace | Workspace cleanup | Drop users array. Keep key + token (Twilio API Key/Secret). |
| User | User cleanup | Drop activity (replaced by agent_status). |
| Voice SDK | Per-workspace tokens | ADR-0016. |
| Throughput | Per-workspace config | ADR-0017. |
| API boundary | Platform boundary | ADR-0018. |
| Queue status | Overloaded column | Complete normalization in v2. |
| Shared logic | _shared/ home | Split: shared/ for CallCaster-specific, chs packages for reusable. |
