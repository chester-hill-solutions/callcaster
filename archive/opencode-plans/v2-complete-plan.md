# CallCaster v2 — Complete Architecture Plan (compaction-safe summary)

## Decision: Clean rebuild in callcaster-v2, one-shot cutover

**NOT strangler-fig.** Build v2 clean in the `callcaster-v2` repo. Live v1 continues on Supabase until v2 is ready. One maintenance-window cutover: export Supabase data → transform → import to Railway → repoint Twilio + DNS. v1 stays as fallback.

## 26 ADRs + CONTEXT.md

### v2 Infrastructure (0001-0010)

| ADR | Decision |
|---|---|
| 0001 | Bun + react-router-serve (drop Express, drop 277-line custom server, drop buffer-polyfill) |
| 0002 | Shed Supabase entirely (Auth, Realtime, Storage, Edge, RLS, pg_cron, triggers, JS client, database.types.ts). Keep Postgres on Railway. |
| 0003 | Drizzle + postgres driver. Hybrid: Drizzle for CRUD, plpgsql RPCs for concurrency (FOR UPDATE SKIP LOCKED). Repository pattern (routes never call db directly). |
| 0004 | Scoped Drizzle client (createTenantDb), no RLS. Admin client for worker only. requireWorkspaceAccess stays as role gate. withAppCurrentUser for transaction-scoped auth context. |
| 0005 | pg-realtime: SSE + workspace_events + LISTEN/NOTIFY + adaptive poll + cursor resume. Extract as @chs/pg-realtime. DATABASE_DIRECT_URL for LISTEN. SSE route outside _auth layout. |
| 0006 | No DB-side behavior logic. Credits trigger → Drizzle tx (ledger insert + credits update gated on inserted, SELECT FOR UPDATE). NOTIFY is signal, not behavior. |
| 0007 | Generalized job table + Bun worker. HTTP wake (POST /internal/jobs/wake). UPDATE WHERE status='queued' claim (no claimed_until for simple jobs; add claimed_until for ACD/predictive). buildJobIdempotencyKey (SHA-256 hash). api_rate_limit_windows + api_idempotency_keys DB tables. Extract as @chs/job-worker. |
| 0008 | **Clean rebuild in callcaster-v2** (not strangler-fig). 11-phase build order: schema → auth → data layer → worker → realtime → Twilio routes → API routes → UI routes → tests → deployment → cutover. Full feature parity required (drop RCS only). |
| 0009 | All Twilio webhooks into Bun. Callback map (docs/twilio-canonical-callback-map.md) is the migration checklist. Only 1 new route (ivr-recording); 3 already exist. SUPABASE_URL env removed. |
| 0010 | Better Auth (one-shot user migration, bcrypt preservation, session invalidation). 2FA for voter-data roles. Custom API key auth stays (sha256 + timingSafeEqual). ensureProfileForUser hook. |

### Non-v2 Existing Decisions (0011-0018)

| ADR | Decision |
|---|---|
| 0011 | Twilio subaccount-per-workspace. Signature validation per-workspace. Dev fallback to main token. |
| 0012 | Conference-per-call bridging (not direct Dial). Enables supervisor listen/whisper/barge. |
| 0013 | Roll-your-own ACD on Twilio Queues + Conferences, not TaskRouter. |
| 0014 | Doc-first OpenAPI (hand-authored spec in code, not annotation-generated). |
| 0015 | Domain IDs as PK (call/message get domain id, twilio_sid as correlation column). Drop Twilio API noise columns. |
| 0016 | Per-workspace Twilio Voice SDK tokens (API key + secret from workspace.key/token). |
| 0017 | Per-workspace throughput config derived from Twilio sender class. |
| 0018 | Public API as platform boundary (consumed by Adagio via scriptkit-callcaster-client). API contract must be preserved. |

### Domain-Driven from Political Science (0019-0023)

| ADR | Decision | Evidence |
|---|---|---|
| 0019 | 1-5 support scale as typed disposition enum. 1=Strong Support, 2=Lean, 3=Undecided, 4=Lean Opp, 5=Strong Opp. | Industry standard (VAN/NGP). User request: "Undecided button" (Ayaan Virani). |
| 0020 | Three-phase campaign model (ID/Persuasion/GOTV). campaign.phase enum. Different targets/scripts/metrics per phase. | "Blending phases is one of the most common mistakes" (field ops research). |
| 0021 | Household as first-class domain entity. Address-keyed, voters grouped, do-not-knock flag. Extract as @chs/household. | Finnish RCT: >100% household spillover (Hirvonen 2024). Existing group_household_queue + dequeue_household. |
| 0022 | Typed voter contact results. support_level (1-5), volunteer_interest, lawn_sign, vote_by_mail, issue_tags[], membership_sold. Replace outreach_attempt.result: Json. | "Require at least one issue tag per contact" (field ops standard). |
| 0023 | Voter list lifecycle. contact tracks voter_list_source (liberalist/van/elections_canada), imported_at, expires_at, voter_id. | Liberalist access revoked without notice (Noah's Toronto-Danforth incident). |

### Architecture (0024-0026)

| ADR | Decision |
|---|---|
| 0024 | Browser-based softphone via Twilio Voice SDK. 17 React hooks. Two wiring paths (campaign via useTwilioDevice, handset/agent via useSoftphoneController) sharing one canonical session owner (useCallHandling). 7-phase call state machine. |
| 0025 | Dual dial modes (manual "call" + predictive auto-dial). Predictive uses queue-next worker job. Manual uses agent-initiated dial. Call screen branches on dial_type. |
| 0026 | Calling-only scope boundary. CallCaster = calling/SMS. quick-canvass = canvassing. Coordinate via @chs/pg-realtime shared event bus + shared voter data layer. Do not build canvassing into CallCaster. |

## 5 chs packages to extract (2+ consumers rule)

1. **@chs/pg-realtime** — SSE + workspace_events + LISTEN/NOTIFY + cursor resume (from quick-canvass)
2. **@chs/job-worker** — backgroundJobs table + enqueue + processor + worker + HTTP wake + authz (from quick-canvass)
3. **@chs/workspace-schema** — 6 shared Drizzle tables (workspaces, members, invites, events, activity log, jobs) with app-specific column extension
4. **@chs/csv-import** — CSV parsing + column mapping + chunked processing + injection protection (from both apps)
5. **@chs/household** — households table + key generation + address normalization (from quick-canvass, CallCaster adds phone/voter fields)

## Additional packages to adopt (from chs monorepo)

- @chs/auth + auth-postgres + auth-react-router (auth stack — replacing Supabase Auth)
- @chs/scriptkit-call-script-core + -react (already used, upgrade to React 19)
- @chs/errors (zero-dep Postgres error formatters)
- @chs/validation (Canadian phone/email/name normalization + Zod schemas)
- @chs/http (jsonOk/jsonError/request parsing)
- @chs/search-params (URL param helpers)

## Database pruning

**DROP tables:** email, email_campaign, audience_rule, campaign_schedule_jobs, twilio_cancellation_queue, workspace_permissions, phone_verification
**CONSOLIDATE:** live_campaign + ivr_campaign + message_campaign → into campaign (type-gated columns)
**COMPLETE:** campaign_queue.status normalization (drop overloaded status, keep queue_state + assigned_to_user_id + provider_status)
**PRUNE columns:** call/message (SID→ID per ADR-0015, drop API noise), workspace.users array, user.activity, contact.carrier/address_id/fullname
**NORMALIZE:** workspace.twilio_data JSONB → typed tables (workspace_twilio_config, workspace_onboarding, workspace_sync_snapshot) — PENDING user confirmation
**SURVEY:** keep inline with minimal coupling
**RCS:** drop (already feature-flagged off, dead code)

## Build order (11 phases)

1. Schema (MCP-aided Drizzle schema generation with all pruning + domain columns)
2. Auth (Better Auth + Drizzle adapter + 2FA)
3. Data layer (Drizzle repos, scoped tenant client, withAppCurrentUser)
4. Worker + job table (@chs/job-worker, HTTP wake, all job handlers)
5. Realtime (@chs/pg-realtime, SSE route, workspace_events)
6. Twilio routes (all webhook handlers, signature validation, IVR, ACD)
7. API routes (public API, doc-first OpenAPI, API key auth, platform API)
8. UI routes (workspace shell, campaigns, call screen + softphone, chats, analytics, admin, onboarding, settings, survey)
9. Tests (PGlite per file, Vitest node + ui, E2E with Playwright)
10. Deployment (Dockerfile web + worker, railway.web.toml + railway.worker.toml, Railway Postgres + Buckets)
11. Cutover (data migration script, user migration, Twilio repoint, DNS switch, maintenance window)

## Cutover plan

1. Export Supabase Postgres (pg_dump)
2. Transform: drop vestigial tables, consolidate campaign types, SID→ID, normalize queue status, add domain columns, create household table, normalize twilio_data
3. Import to Railway Postgres
4. Run Drizzle migrations
5. Create Better Auth users (bcrypt preservation from Supabase auth.users)
6. Repoint Twilio webhook URLs (SUPABASE_URL/functions/v1/* → BASE_URL/api/*)
7. DNS switch (callcaster domain → v2 Railway service)
8. v1 stays running as fallback

Rehearse on Railway branch environment first. Maintenance window (Sunday 2-6am EST). If v2 breaks, repoint DNS/Twilio back to v1.

## Testing strategy

- PGlite per test file (in-memory, no Docker, real DB behavior, replaces 53 PostgREST mock factories)
- Docker Compose for local dev (Postgres 15 + MinIO + Inbucket)
- Vitest node + ui (no Deno)
- Playwright E2E (mocked Twilio/Stripe, Better Auth seed users)
- Coverage gate: Vitest only (drop Deno LCOV)

## Deployment

- Railway Postgres (branchable for cutover rehearsal)
- Railway Buckets (S3-compatible, prod) + MinIO (dev)
- Two Railway services: web (react-router-serve under Bun) + worker (Bun job-worker)
- Multi-stage Dockerfiles (dev deps + chs package builds → prod deps → build → runtime)
- chs packages vendored at vendor/chester-hill-solutions/ with workspace:* links
- preDeploy: db:migrate (Drizzle migrations before container starts)
- Env: DATABASE_URL, AUTH_SECRET, WORKER_WAKE_URL/SECRET, S3_*, BODY_SIZE_LIMIT, DATABASE_PREPARE_STATEMENTS=false

## Domain context (from political science + second brain)

- CallFire is the current production tool; CallCaster was demoed in 2024
- "Undecided button" is a direct user request (validates ADR-0019)
- Liberalist VPB is a third calling workflow (list + script + event)
- Volunteer calls work; professional/robocalls do not (Gerber & Green 2000)
- Two-round calling triples the effect (McNulty 2005)
- Household spillover >100% (Hirvonen 2024)
- Canada: CASL (political exempt if non-commercial), PIPEDA, CRTC (robocall ID required), one-party recording consent
- No Canadian field experiments exist — CallCaster could enable them
- CallCaster is operated by Nathaniel Arfin, embedded in Canadian Liberal politics (Team Nate, Team Tanveer, Rory for Mayor, Frank Domenic)

## Reference implementation

quick-canvass is the proven reference for the entire v2 stack:
- Drizzle schema (app/db/schema.ts + auth-schema.ts)
- Better Auth (app/server/auth-instance.ts)
- postgres driver + db-session (app/lib/db-session.server.ts)
- Job worker (app/server/job-worker.ts + job-enqueue.server.ts + job-processor.ts)
- SSE realtime (app/features/workspace-events/ + app/server/workspace-events-stream.server.ts)
- Households as entity (app/db/schema.ts households pgTable)
- Multi-stage Dockerfiles + Railway configs
- Repository pattern (app/server/repositories/*.repo.ts)

## Key code references (in callcaster v1)

- server/index.js (277-line Express server — dropped in v2)
- app/lib/database.types.ts (3093 lines, 173 importing files — dropped in v2)
- supabase/functions/_shared/ (22 modules — ported to shared/ in v2)
- supabase/functions/__tests__/ (23 Deno tests — ported to Vitest)
- app/hooks/call/ (17 softphone hooks — rewritten in v2)
- app/components/ui/ (31 design system primitives — copied to v2)
- shared/ (7 cross-process logic files — copied to v2)
- @chester-hill-solutions/scriptkit-call-script-core + -react (already used — upgraded in v2)

## All decisions resolved

1. **workspace.twilio_data**: Normalize to typed tables (workspace_twilio_config, workspace_onboarding, workspace_sync_snapshot)
2. **Survey in v2**: Inline with minimal coupling (survey tables don't reference campaign/contact/queue)
3. **callcaster-v2 repo**: Fresh start from bare template (zero Supabase code, v1 stays as reference/fallback)
4. **React Router version**: RR8 (released June 17, 2026 — non-breaking from v7, all future flags default, ESM-only, React 19+, Vite 7+)

## ADR-0001 revision

ADR-0001 now specifies: Bun + react-router-serve on **React Router v8** (not v7). No future flags to manage. ESM-only (Bun is ESM-native). `react-router-dom` removed (consolidated into `react-router`). @chs/auth-react-router and @chs/scriptkit-call-script-react should work (non-breaking upgrade).

## Ready to write

All 26 ADRs + CONTEXT.md are ready to be written into `docs/adr/` and `CONTEXT.md`. The plan is complete. Lift plan mode to begin writing.
