# Final sweep findings — changes to the v2 plan

## Six subagent results synthesized

### From "Sweep CallCaster app/lib" (162 files read)

**New findings that change the plan:**

1. **In-memory rate limiting** (`platform-rate-limit.server.ts`: `Map<string, RateLimitBucket>`) and **in-memory idempotency** (`platform-idempotency.server.ts`: `Map<string, IdempotencyRecord>`) — both break under horizontal scaling. Must move to DB or Redis. quick-canvass already has `api_rate_limit_windows` and `api_idempotency_keys` tables in Drizzle.

2. **`twilio_data` JSONB blob is a mega-mutable column** holding: `portalConfig`, `portalSync`, `onboarding` (full messaging onboarding state machine), `billingReconciliationSnapshot`. Hand-rolled read-modify-write in 6+ files with no optimistic locking — concurrency risk. v2 should normalize to typed columns or a sub-table.

3. **14 RPC calls** to Postgres functions — significant business logic in DB. The hybrid approach (ADR-0003) keeps these but they need Drizzle wrappers.

4. **Service-role Supabase client creation mid-request** in 6 files — privilege elevation pattern that becomes a Drizzle admin client.

5. **`twilio-workspace-credentials.ts` is verbatim duplicated** in `supabase/functions/_shared/` — the file's own comment says so. Confirms Edge exit deduplication.

6. **`TWILIO_IVR_RUNTIME` env var** (`twilio-ivr-runtime.server.ts`) — existing strangler-fig switch for remix↔edge IVR. Already proven pattern for the v2 migration.

7. **`sudo` access level** for admin routes (`requireSudo` checks `user.access_level === "sudo"`) — separate from workspace roles. Stays in v2.

8. **SSRF guard** (`safe-outbound-url.server.ts`) — security-critical, reusable across chs apps. Extraction candidate.

9. **GSM-7/UCS-2 SMS segment counting** (`sms-segments.ts`) — pure logic, fully reusable. Already noted but confirmed as extraction candidate.

10. **Two competing type-safety/error utility sets** (`type-safety-utils.ts` + `type-utils.ts` + `errors.server.ts`) — consolidation needed during v2.

11. **Legacy `api-client.ts`** and **`form-validation.ts`** — appear unused/parallel to the Zod pattern. Deletion candidates.

12. **`app/contexts/` is dead** — both files are 0-line empty stubs, imported nowhere. Delete.

### From "Sweep components and hooks"

**New findings that change the plan:**

1. **Two softphone wiring paths sharing one canonical session owner** (`useCallHandling`) — `useTwilioDevice` (campaign) vs `useSoftphoneController` (handset/agent). Worth an ADR sub-note on call-session ownership architecture.

2. **Legacy hand-rolled script editor** (`components/script/`) coexists with the **scriptkit editor** (`campaign/settings/script/`). Decision needed: consolidate or keep both? Candidate for the schema/code pruning.

3. **`QueueContent.tsx` bypasses `useSupabaseRealtimeSubscription`** and creates its own direct channel — consolidation opportunity during SSE migration.

4. **`AudienceUploader.tsx` already implements SSE+polling-fallback pattern** (5-failure threshold → 2s HTTP polling) — a working precedent for ADR-0005.

5. **`useChatRealtime.ts` 60s-interval + 2s-debounce refresh** coexisting with realtime — another polling-fallback precedent for ADR-0005.

6. **`file-assets/columns.tsx` imports `FileObject` from `@supabase/storage-js`** — type-only but a storage-swap touch point.

7. **Direct Supabase JS client in hooks** (10 surfaces) — `useSupabaseRoom` (user.activity write), `useSupabaseRealtime` (queue hydration), `useRealtimeData` (initial fetch), `useChatRealtime` (RPC), `useChatThread` + `useChatsPage` (mark-as-read writes), `useContactSearch` (RPC + message lookup), `QueueContent` (contact hydration), `AudienceUploadHistory` (direct fetch).

### From "Sweep test and e2e patterns"

**New findings that change the plan:**

1. **237 Vitest test files + 23 Deno test files + 25 E2E specs** — the `makeSupabase()` PostgREST query-builder mock pattern appears in **53 distinct factory definitions across ~130 test files**. This is the single largest migration surface.

2. **PGlite-per-file strategy should replace mocks, not just supplement them** — instead of rewriting 53 mock factories into Drizzle mocks, seed a real PGlite instance per test file and query against it. Dramatically reduces per-file rewrite effort.

3. **`route-auth-mock` helper (42 consumers)** — centralizes the Better Auth session migration if rewritten once.

4. **E2E seed data uses Supabase auth admin** (`auth.admin.createUser`) — must rewrite to Better Auth user creation + Drizzle inserts.

5. **`workspace_permissions` table seeded for RLS** — the E2E seed inserts 22 owner/admin perms, 7 member, 1 caller. This table is on the DROP list (vestigial). E2E seed must remove this.

6. **Coverage scripts hardcode Deno LCOV** — `coverage-lib.mjs` exits with error if Deno LCOV missing. Must remove the Deno requirement.

7. **E2E workflow uses `supabase start` / `db reset` / `status -o env`** — entire Supabase boot sequence in `.github/workflows/e2e.yml` replaces with Docker Compose.

### From "Deep dive quick-canvass reference impl"

**New findings that change the plan:**

1. **`db-session.server.ts` is a PostgREST-shaped compat client** built on `postgres` — it lets legacy `supabase.from(table).select().eq()` code run unmodified over postgres-js. This is the **migration bridge** that makes the strangler-fig feasible without rewriting all 173 files at once. `functions.invoke` maps to `enqueueJob`. `storage.from().upload()` wraps S3. `rpc()` runs inside `withAppCurrentUser`.

2. **`withAppCurrentUser(userId, fn)`** — runs `fn` inside a `sql.begin()` transaction with `app.current_user_id` set via `set_config(..., true)` (transaction-local). This is how SECURITY DEFINER RPCs see the actor — replaces Supabase's implicit auth context.

3. **Repository pattern** — all Drizzle queries live in `app/server/repositories/*.repo.ts`. Routes never call `db` directly. Cross-workspace authz embedded in UPDATE WHERE via `exists()` subquery — atomic authz + update.

4. **`assertSchemaReady(sql)` at module load** — blocks startup on pending migrations. Prevents the race where a new deploy starts serving before migrations complete.

5. **Migration runner is custom** (`scripts/db-migrate.mjs`), NOT `drizzle-kit migrate` — plain SQL files in `drizzle/`, transactional with a ledger table (`app_schema_migrations`). Has a `baseline --yes` mode for adopting on an existing DB.

6. **SSE route must be OUTSIDE `_auth` layout** — streaming Response breaks Node/Express body writes inside the layout. Auth via `getSessionUserIdOrNull` (not middleware context).

7. **`DATABASE_DIRECT_URL`** for LISTEN/NOTIFY — pooled URLs (PgBouncer transaction mode) don't support LISTEN. Separate connection with `max: 1, prepare: false`.

8. **`jsonbParam(value)` helper** — `JSON.stringify` for jsonb binds to avoid postgres.js `Parameter` wire-encode bugs under SSR bundles.

9. **Job chaining** — after a geocode job completes with `pendingRemaining > 0`, enqueue another job with `chainFromJobId` in the payload. Pattern for paginated work.

10. **`api_rate_limit_windows` and `api_idempotency_keys` tables** — quick-canvass already solved the in-memory rate limiting and idempotency problems with DB tables. CallCaster should adopt these instead of Redis.

11. **Worker maintenance tasks after drain** — `pruneOldWorkspaceEvents`, `pruneOldApiRateLimitWindows`, `purgeWorkspacesPastDeletionGrace`. Each wrapped in try/catch.

12. **Vendor pattern** — chs packages vendored at `vendor/chester-hill-solutions/` with `workspace:*` links, built in dev Docker stage, `dist/` copied across stages.

### From "Sweep chs packages"

**New findings that change the plan:**

1. **`adagio` is a private APP, not a published package** — it's an internal "Client Launch orchestrator" that consumes CallCaster via `scriptkit-callcaster-client`. v2 must keep API routes compatible with Adagio's `providers/callcaster/` expectations.

2. **`auth-postgres` only has one plugin: `magicLink`** — re-exported from `better-auth/plugins`. No custom CHS plugins.

3. **`scriptkit-call-script-react` peers on React 19** — CallCaster v1 (React 18) is below the peer range. v2 (React 19) is a clean fit.

4. **Additional packages to adopt (high value, low risk):**
   - `@chs/errors` — zero-dep Postgres/Supabase error formatters
   - `@chs/validation` — Canadian phone/email/name normalization + Zod schemas (zod ^4 matches v2)
   - `@chs/http` — `jsonOk`/`jsonError`/request parsing (verify OpenAPI envelope compat)
   - `@chs/search-params` — URL param helpers for list/filter routes

5. **`scriptkit-callcaster-client` is a CONTRACT obligation, not an adoption** — CallCaster is the server; this client calls CallCaster. v2 must keep `/auth/token`, `/workspaces`, `/campaigns/create-with-script`, `/sms`, `/chat_sms`, `/audience-upload` routes compatible.

### From "Sweep remaining domain knowledge"

**New findings that change the plan:**

1. **NEW ADR-0026: Calling-only scope boundary** — CallCaster = calling; quick-canvass = canvassing; coordinate via chs shared voter-data + pg-realtime. Building canvassing into CallCaster would duplicate an actively-developed sibling product. This is the single clearest missing ADR.

2. **CallFire is the tool actually in production use** — CallCaster was only demoed in 2024. The v2 plan should add a "Why CallCaster over CallFire" positioning that the domain ADRs collectively answer.

3. **"Undecided" button is a direct user request** — Ayaan Virani asked for it. This is exactly `3` on the 1-5 support scale. Confirms ADR-0019 as field-requested, not just standardization.

4. **Liberalist Virtual Phone Bank (VPB) is a third calling workflow** — list + script + event triple. CallCaster's model (campaign + audience + script) maps closely, but the "event" as a coordination object (recurring phone bank) is a field reality CallCaster doesn't model. Feature for v2, built on ADR-0007 worker scheduling.

5. **2FA should be enforced for voter-data-accessing roles** — `information-security-basics-for-campaigns.md` mandates MFA for confidential data access. Refinement to ADR-0010.

6. **No `CONTEXT.md` exists** — neither at root nor in docs/. No `docs/adr/` directory exists. The domain ADRs (0019-0023) in `.opencode/plans/` are drafted but not integrated.

7. **CONTEXT.md must include political/field glossary** — the current stub is infrastructure-only (Workspace, Campaign, Script, Queue Entry). Omits every political term (Voter, Household, Support Level, Campaign Phase, Issue Tag, Voter List, Liberalist, GOTV, E-day, Contact Rate, Callback Audit, VPB).

8. **Call recording consent** — Canada is one-party-consent (Criminal Code s. 184). Campaign caller is the consenting party. Document in CONTEXT.md.

9. **No Canadian field experiments exist** — CallCaster's typed contact results + voter-list cross-reference could enable the first Canadian campaign field experiments. Strategic positioning.

## Updated ADR count: 26 ADRs + CONTEXT.md

| Range | Topic | Count |
|---|---|---|
| 0001-0010 | v2 infrastructure | 10 |
| 0011-0018 | Non-v2 existing decisions | 8 |
| 0019-0023 | Domain-driven from political science | 5 |
| 0024-0025 | Browser softphone + dual dial modes | 2 |
| **0026** | **NEW: Calling-only scope boundary** | **1** |
| **Total** | | **26** |

## Additional ADR refinements

- **ADR-0004 (scoped client):** Adopt quick-canvass's PostgREST-shaped compat client (`db-session.server.ts`) as the migration bridge. Adopt `withAppCurrentUser` for transaction-scoped auth context. Adopt repository pattern (routes never call `db` directly). Adopt `exists()` subquery for atomic authz + update.
- **ADR-0007 (job table):** Adopt quick-canvass's `UPDATE WHERE status='queued'` claim pattern (no `claimed_until` needed for simple jobs). Add `claimed_until` only for ACD/predictive. Adopt `api_rate_limit_windows` + `api_idempotency_keys` DB tables instead of in-memory maps. Adopt job chaining pattern.
- **ADR-0008 (strangler-fig):** PGlite-per-file should replace PostgREST mocks, not supplement them. Seed real PGlite and query against it. Rewrite `route-auth-mock` helper once (42 consumers). Schedule domain schema additions (ADR-0019-0023) during Drizzle/MCP-gen step.
- **ADR-0009 (Twilio specials):** The `TWILIO_IVR_RUNTIME` env var is an existing strangler-fig switch — proven pattern. SSE route must be OUTSIDE `_auth` layout.
- **ADR-0010 (Better Auth):** Add 2FA enforcement for voter-data-accessing roles (owner/admin/field_director). Adopt `databaseHooks.user.create.after → ensureProfileForUser` pattern.
- **ADR-0005 (pg-realtime):** `DATABASE_DIRECT_URL` for LISTEN/NOTIFY (pooled URLs don't support LISTEN). `jsonbParam` helper for jsonb binds. Adopt the `workspace_events` (ephemeral) vs `workspace_activity_log` (permanent audit) separation.

## Additional extraction candidates

| Package | What | Consumers | Why |
|---|---|---|---|
| `@chs/safe-outbound-url` | SSRF guard (blocks private IPs, localhost) | CallCaster, potentially all chs apps | Security-critical, reusable |
| `@chs/sms-segments` | GSM-7/UCS-2 SMS segment counting | CallCaster only (but pure logic) | Maybe — single consumer for now |
| `@chs/twilio-workspace-credentials` | Workspace credential resolution (dedup the verbatim copy) | CallCaster app + Edge (going away) | Stays in shared/ — single consumer after Edge exit |

## Deletion candidates (code pruning)

- `app/contexts/CampaignContext.tsx` + `WorkspaceContext.tsx` — empty 0-line stubs
- `app/lib/api-client.ts` — legacy, appears unused
- `app/lib/form-validation.ts` — legacy, parallel to Zod
- `app/components/CallScreen.TopBar.tsx` — inline-styled legacy, superseded
- Consolidate `type-safety-utils.ts` + `type-utils.ts` + `errors.server.ts` — three competing error/type utility sets
- Consolidate `QueueContent.tsx` direct channel into `useSupabaseRealtimeSubscription`
- Consolidate legacy `components/script/` editor onto scriptkit (decision needed)

## Migration bridge insight

quick-canvass's `db-session.server.ts` (PostgREST-shaped compat client on postgres-js) is the **key insight that de-risks the entire strangler-fig**. It means:
- The 173 files importing `database.types` don't all need rewriting at once
- Legacy `supabase.from(table).select().eq()` code runs unmodified over postgres-js
- `functions.invoke` maps to `enqueueJob` (Edge Function calls become job enqueues)
- `storage.from().upload()` wraps S3
- `rpc()` runs inside `withAppCurrentUser` transaction
- `channel()` / `removeChannel()` are no-op stubs (realtime becomes SSE separately)

This means the strangler-fig step 2 (Drizzle adoption) can be **even more incremental** than I proposed: adopt the compat client first (runs against Supabase Postgres via conn string), then migrate queries to Drizzle repos one at a time, then drop the compat client when all queries are Drizzle-native.
