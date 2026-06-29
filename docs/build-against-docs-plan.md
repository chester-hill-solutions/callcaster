# Build Against Docs — Execution Plan

**Created:** 2026-06-28  
**Status:** Slices 0–10 complete, Slice 11 Phase 1–2 complete (Phase 3 blocked on Railway)  
**Branch:** `visual-asset-review`  
**Issues:** #1000–#1013 on chester-hill-solutions/callcaster

---

## Objective

Treat the ADRs (`docs/adr/0001`–`0026`) + active docs (`docs/*.md`) + dryness review (`docs/dryness-review-2026-06.md`) as the spec. Find where the codebase drifts. Close the gaps. Implement to match docs.

## Inputs

- **26 ADRs** in `docs/adr/`
- **43 active docs** in `docs/*.md`
- **Dryness review** (`docs/dryness-review-2026-06.md`) — 7 parallel explore agents audited `app/` for duplication/divergence
- **5 ADR-cluster gap analyses** — parallel explore agents audited code vs ADRs (infra, telephony, API, domain, scope)

## Decisions resolved

| Decision | Choice | Rationale |
|---|---|---|
| Credits sync owner | (b) App-layer plpgsql RPC, drop trigger | Matches ADR-0006; `apply_ledger_entry_and_sync_credits` RPC |
| Execution scope | All four (v1 consolidation, v1 polish, domain schema, v2 infra) | Full conformance |
| v2 rebuild location | In-place in `callcaster/` | ADRs reference paths in callcaster/; Slices 1-10 cleaned it |
| Railway migration | Actually migrate DB to Railway | Per ADR-0002 as written |
| Drizzle schema source | Introspect from Supabase now, switch to Railway later | No Docker needed |
| Phase 3 cutover | Big-bang (all 678 `.from()` sites in one pass) | Faster cutover |
| Temp file `scripts/tmp-authclass-check2.ts` | Delete | Approved |

---

## Completed work (Slices 0–10)

### Batch 0 — v1-feasible, no schema (done)

| # | Issue | What | Verification |
|---|---|---|---|
| 0a | #1000 | acd-router `X-Twilio-Signature` validation (P1 security) | 80 Deno tests |
| 0b | #1001 | OpenAPI `:param`→`{param}` path templating (ADR-0014) | 131/131 surface check |
| 0c | #1002 | 6 routes auth-class metadata fix (ADR-0018) | spec regenerated |

### Slice 1 — Dead-code purge (#1005, done)

Deleted ~20 dead files/helpers:
- `app/contexts/{CampaignContext,WorkspaceContext}.tsx` (1-byte stubs)
- `app/components/script/` (6 files, ~35 KB)
- 5 flat-root QuestionCard/CampaignSettings.Script files (~30 KB)
- `app/components/forms/` (3 files)
- `app/lib/messaging-onboarding-display.ts` (verbatim duplicate)
- `app/lib/database/campaign-outreach-export.server.ts` (0 runtime callers)
- `app/lib/utils.ts` dead helpers (`extractKeys`, `flattenRow`, `generateCSVContent`, `getAllKeys`)
- `app/lib/outreach-export-types.ts` (orphaned)
- `app/twilio.server.ts:sendSms` (0 callers)
- `app/lib/platform-data.server.ts:requireResourceWorkspaceAccess` (dead alias)
- `app/lib/platform-data.server.ts:getSupabaseFromAuth` (duplicate of `getDualAuthSupabase`, 5 internal callers redirected)
- `app/lib/form-validation.ts` + `app/hooks/useForm.ts` (0 callers)
- 3 dead `getCampaignReadiness` imports
- 28 dead `if (!user)` guards after `verifyAuth` (which throws on no user)
- 4 dead test files + 3 dead test blocks trimmed

### Slice 2 — Foundation consolidation (#1006, done)

- Folded `type-utils.ts` → `type-safety-utils.ts` (picked safer impls)
- Renamed `AppError` interface → `AppErrorShape`; class is the only `AppError`
- Extracted `logger-core.ts` from 95%-identical `logger.server.ts`/`logger.client.ts`
- Merged `ErrorResponse` + `ClientError` → `ErrorPayload`
- One `isObject`/`isRecord` in `type-safety-utils.ts`
- One `safeJsonParse` (validating version)
- `jsonError` extended with optional headers; `rateLimitResponse` delegates
- `formatTime` param renamed `milliseconds`→`seconds`; added `formatTimeShort(seconds)` for M:SS
- Deleted `form-validation.ts` + `useForm.ts`

### Slice 3 — Canonical auth/role gate (#1003, P0, done)

- Extended `requireWorkspaceLoaderContext` + `withWorkspaceApiLoader/Action` with `{minRole}` option
- Guarded 6 membership-less loaders (authz gap fixed): `audiences/$audience_id`, `audios/new`, `billing`, `exports`, `campaigns/$selected_id/queue`, `campaigns/archive`
- Added `WORKSPACE_ROLE_RANK` + `hasMinRole()` helper
- Deleted `api-route-auth.server.ts` (grab-bag); moved `resolveDualAuthSession`/`resolveJsonAuthSession` to `api-auth.server.ts`; moved `authForOutreachAttempt` to `platform-data.server.ts`
- Updated `test/setup-route-auth-mock.ts` + `test/helpers/route-auth-mock.ts` for moved functions

### Slice 4 — Billing correctness (#1004, P0, done)

- New plpgsql RPC `apply_ledger_entry_and_sync_credits` (atomic insert + credits update)
- Dropped `transaction_history_update_credits` trigger (ADR-0006)
- SMS debits by `num_segments` (was flat 1 credit)
- `debitAmountFromCredits` used at every debit site (deleted hand-rolled `amount: -X`)
- Voice idempotency keys namespaced: `call:${sid}:${kind}` (was `call:${sid}` — double-debit hazard)
- `kind` required on `billingUnitsFromCallDurationSeconds`
- Unified `TERMINAL_BILLABLE_CALL_STATUSES` + `TERMINAL_BILLABLE_SMS_STATUSES` in `shared/pricing.ts`
- Extracted `shared/billing-keys.ts` (`smsKey`/`callKey`/`numberRentalPurchaseKey`/`numberRentalCycleKey`/`stripeSessionKey`/`stripeEventKey` + `bucketFromIdempotencyKey`)
- Updated CONTEXT.md + AGENTS.md

### Slice 5 — Twilio layer (#1007, done)

- `createWorkspaceTwilioInstance` uses API keys (`key`/`token`), not auth token (ADR-0011)
- Collapsed 4 inline subaccount builders onto canonical factory
- Fixed 3 route-level `new Twilio(...)` leaks → workspace client
- Created `twilio-twiml.server.ts` (`hangupTwiml`/`pausePlayTwiml`/`pauseSayTwiml`/`pauseTwiml`); replaced 16 inline string-TwiML sites (XML escaping)
- Extracted `persistCallStatusFromParams`; `ivr/status` + `auto-dial/status` now route through `twilio-call-status.server.ts`
- `loadWorkspaceTwilioData` canonical; renamed webhook duplicate → `resolveWorkspaceTwilioData`; collapsed 13 inline reads

### Slice 6 — Queue normalization (#1008, done)

- Flipped 8 writers to `includeNormalizedFields: true`
- Fixed hand-rolled dequeue (`auto-dial/$roomId`) → `buildDequeuedQueueUpdate`
- Fixed hand-rolled queue filter (`campaign.server.ts:495`) → `applyQueueStatusFilter`
- Extracted `releaseAssignedQueueForUser` canonical; collapsed 2 duplicates
- Added `queue_state` branches to `applyQueueStatusFilter`
- Dropped legacy `status` fallback in `isQueued`/`isDequeued`
- Updated `docs/queue-status-normalization-rollout.md`

### Slice 7 — Readiness collapse (#1009, done)

- Extracted `WorkspaceReadinessPredicate[]` table in `messaging-onboarding/predicates.ts` (non-`.server.ts`)
- Adopted `CampaignReadiness`'s `{code, message, severity}` as `ReadinessResult`
- Rewrote 5 evaluators as projections over predicate table
- `assertWorkspaceCanSendSms` now reuses `deriveWorkspaceMessagingReadiness` (send-gate divergence fixed)
- Per-channel `BUSINESS_PROFILE_REQUIRED_FIELDS` (4 for A2P, 8 for RCS)
- Moved readiness computation from React bodies to loaders
- Fixed `.server.ts` barrel imported by client UI → predicates module

### Slice 8 — Campaign/CSV/SMS (#1010, done)

- Campaign exporter → `csv.ts` (`csvRow`/`toCsvString` replacing hand-rolled `escapeExportCell`)
- Created `sms-send.server.ts` shared send+persist; both `chat-sms` + `sms.action` delegate
- Extracted `safeFilenamePart` + `formatDateUtc` to `csv.ts`; collapsed 2 survey CSV serializers
- Exported `compareByRecentActivity`; replaced 3 inline sort comparators
- Created `pagination.server.ts` (`parsePagination` + `paginatedEnvelope` + `PaginationMeta`)

### Slice 9 — UI/hooks (#1011, done)

- Split `utils.ts` (637→163 lines); phone helpers → `lib/phone.ts`, CSV → `csv-contacts.ts`, DTMF → `lib/dtmf.ts`, queue → `queue-utils.ts`, deep-equal → `deep-equal.ts`
- One `KEYPAD_KEYS` in `lib/dtmf.ts`; replaced 3 sites
- `useCallStatusPolling` now calls `normalizeProviderStatus` (was forwarding raw)
- Queue literals → imported from `queue-status.ts` (deleted hardcoded `STATUS_OPTIONS`)
- `WebhookEvent` → imported from `twilio.types.ts` (deleted local redefinition; added `"voicemail"` to canonical)
- `call-list/` deleted; live exports moved to `call/` + `campaign/settings/script/`
- Raw HTML → `ui/` primitives (`DataTable`, `ui/select`, `FormField`)
- Call-state FSM full collapse deferred (needs focused PR — `useCallHandling`'s `useState<string>` consumed by 4 downstream hooks)

### Slice 10 — Domain schema (#1012, done)

5 new migrations:
- `20260628130000_adr_0019_support_level.sql` — `support_level` smallint CHECK (1–5) on `outreach_attempt` + `contact`
- `20260628130100_adr_0020_campaign_phase.sql` — `campaign_phase` enum + `phase` column on `campaign`
- `20260628130200_adr_0021_households.sql` — `households` table + `contact.household_id` FK + backfill + dequeue RPCs updated
- `20260628130300_adr_0022_typed_results.sql` — typed columns on `outreach_attempt` (`volunteer_interest`, `lawn_sign`, `vote_by_mail`, `issue_tags text[]`, `membership_sold`, `callback_audit`)
- `20260628130400_adr_0023_voter_list_lifecycle.sql` — `voter_list_source` enum + timestamps + `voter_id` on `contact`

UI changes:
- `QueueTable.tsx:531` — 1–5 support_level badges replacing hardcoded disposition union (3 = Undecided prominent)
- Campaign create/edit — phase selector (`CampaignBasicInfo.SelectPhase.tsx`)
- `questions.action.server.ts` — `extractTypedOutreachFields` writes typed columns alongside JSON
- `audience-upload-process.server.ts` — records `voter_list_source` + `voter_list_imported_at`

`database.types.ts` hand-updated with all new enums, tables, columns.

---

## Slice 11 — v2 infra rebuild (ADR 0001–0010, in progress)

**Decision:** In-place in `callcaster/`. Revise ADR-0008. Actually migrate DB to Railway.

### Phase 1 — Drizzle foundation (done)

- [x] Install `drizzle-orm`, `postgres` (postgres-js), `drizzle-kit`
- [x] `app/db/schema.ts` — 43 tables, 13 enums, hand-generated from `database.types.ts` + migrations
- [x] `app/server/db.ts` — connection pool (`DATABASE_URL`), direct connection (`DATABASE_DIRECT_URL`), admin client
- [x] `drizzle.config.ts` — Drizzle Kit config
- [x] `DATABASE_URL` + `DATABASE_DIRECT_URL` added to `env.server.ts` + `required-env-keys.mjs`
- [x] `db:generate`/`db:migrate`/`db:studio` scripts in `package.json`
- [x] Test env vars updated (`test/setup.node.ts`)
- [x] Typecheck clean, 1245 tests pass

### Phase 2 — Scoped Drizzle client (ADR-0004, done)

- [x] `createTenantDb(workspaceId)` — auto-scopes every workspace-column table
- [x] `withAppCurrentUser(userId, fn)` — `db.transaction()` + `set_config('app.current_user_id', ..., true)`
- [x] `requireWorkspaceAccess` → 404 (not 403) on non-membership
- [x] Admin client in route-unimportable module (`app/server/admin-db.ts`; `no-restricted-imports` ESLint rule on `app/routes/**` blocks `@/server/db` + `@/server/admin-db`)
- [x] Drop the 1 remaining RLS policy (`phone_verification`) in a cutover migration (`20260628130500_adr_0004_drop_phone_verification_rls.sql`; `verify-audio-session` loader cut over to service-role client + explicit `user_id` scope)

**Files:** `app/db/workspace-scoped-tables.ts` (28-table registry), `app/server/tenant-db.ts` (`createTenantDb` + `withAppCurrentUser` + `TenantDb`/`ScopedTableApi` types), `app/server/admin-db.ts`, `app/server/db.ts` (admin export removed), `app/lib/database/workspace.server.ts` + `app/lib/workspace-route.server.ts` + `app/lib/workspace-api-route.server.ts` (404 on non-member), `test/tenant-db.test.ts` (17 tests), `.eslintrc.cjs` (route import boundary).
**Verified:** typecheck clean, 1262/1262 node tests, 253/253 UI tests, lint clean (2 pre-existing `scripts.route.tsx` errors), routes verify OK, API surface 131/131.

### Phase 3 — Big-bang Supabase→Drizzle migration (blocked on Railway)

- [ ] Replace 678 `supabase.from()` → Drizzle queries across all routes
- [ ] Replace 32 `supabase.rpc()` → typed `db.execute(sql\`...\`)` wrappers
- [ ] Replace 33 `createSupabaseServerClient` → `createTenantDb` / admin client
- [ ] Replace 174 `Database` type imports → Drizzle `InferSelectModel` / `InferInsertModel`
- [ ] Delete `app/lib/database.types.ts` (3220 lines)
- [ ] Delete `app/lib/supabase.server.ts`
- [ ] Drop `@supabase/ssr` + `@supabase/supabase-js` deps
- [ ] Reduce `supabase/config.toml` to migrations-only

**Strategy:** Delegate in parallel chunks by route module cluster (api+, workspaces+/, admin+/, lib/).

### Phase 4 — Bun + Better Auth (ADR 0001 + 0010, blocked on Phase 3)

- [ ] `package.json` `start` → `bun --bun react-router-serve`
- [ ] `Dockerfile` → `oven/bun` base image
- [ ] Delete `server/index.js` (277 lines), `app/buffer-polyfill.client.ts`
- [ ] Remove `express`, `compression`, `cookie-parser`, `morgan`, `@react-router/express`, `tsx`
- [ ] Add `better-auth` dep + Drizzle adapter
- [ ] `app/db/auth-schema.ts` — Better Auth tables
- [ ] User-import script (bcrypt-preserved from `auth.users`)
- [ ] Swap `verifyAuth` → Better Auth `createSessionReader`
- [ ] `mergeBetterAuthSetCookieHeaders` helper
- [ ] Enforce 2FA for owner/admin/field_director (voter-data roles)
- [ ] Keep custom API-key auth (sha256+timingSafeEqual)
- [ ] Delete `platform-auth.server.ts` Supabase Auth calls

### Phase 5 — SSE realtime + job worker (ADR 0005 + 0007, blocked on Phase 3+4)

- [ ] `workspace_events` (ephemeral) + `workspace_activity_log` (permanent audit) tables
- [ ] SSE route emitting from LISTEN-ing `pg` connection via `DATABASE_DIRECT_URL`
- [ ] Adaptive polling fallback + `Last-Event-ID` cursor resume
- [ ] Replace 6 Supabase Realtime hook sites with SSE hook
- [ ] `job` table (`type`, `status`, `params` jsonb, `workspace_id`, `user_id`, `idempotency_key`, `error`, `result`, `claimed_until`, timestamps)
- [ ] `api_rate_limit_windows` + `api_idempotency_keys` tables
- [ ] Bun worker claims via `UPDATE ... WHERE status='queued' RETURNING`
- [ ] `POST /internal/jobs/wake` (debounced 10s)
- [ ] Port in-process export (536 lines) + upload (325 lines) into job handlers
- [ ] Replace in-memory `Map` rate-limit + idempotency with DB-backed helpers
- [ ] Drop pg_cron (3 migrations)

### Phase 6 — Twilio specials into Bun + cleanup (ADR 0006 + 0009, blocked on Phase 4+5)

- [ ] Port 5 Twilio-facing Edge functions to Bun routes (`ivr-flow`, `ivr-status`, `ivr-recording`, `sms-status`, `acd-router`)
- [ ] Delete remaining 18 Edge functions (dead stubs or internal)
- [ ] Delete `supabase/functions/` (23 functions) + Deno toolchain (`deno.json`, `deno.lock`, `test:coverage:deno`)
- [ ] Collapse `TWILIO_IVR_RUNTIME` strangler switch (hardcode Bun URLs)
- [ ] Normalize `twilio_data` JSONB → `workspace_twilio_config` + `workspace_onboarding` + `workspace_sync_snapshot` typed tables
- [ ] Delete `mergeWorkspaceTwilioData` read-modify-write helper
- [ ] Revise ADR-0008 to acknowledge in-place migration
- [ ] Update CONTEXT.md, AGENTS.md for all v2 changes

### Parallel work (user provisioned)

- [ ] Provision Railway Postgres instance
- [ ] `pg_dump` from Supabase → import to Railway
- [ ] Set `DATABASE_URL` + `DATABASE_DIRECT_URL` env vars on Railway
- [ ] Configure Railway web + worker services (Bun)

---

## Verification

Each slice verified with:
```bash
npm run typecheck && npm run lint && npm run test:node && npm run test:ui
cd supabase/functions && deno test --no-check --allow-env --allow-read --allow-net __tests__/
npm run tools:routes:verify
npm run tools:api:surface:check
```

**Current state:** typecheck clean, 1245/1245 node tests, 253/253 UI tests, 80/80 Deno tests, lint clean (2 pre-existing errors in `scripts.route.tsx`), routes verify OK.

---

## Issue tracker

| Issue | Slice | Status |
|---|---|---|
| #1000 | Batch 0a: acd-router signature | done |
| #1001 | Batch 0b: OpenAPI path templating | done |
| #1002 | Batch 0c: auth-class mismatch | done |
| #1003 | Slice 3: auth/role gate (P0) | done |
| #1004 | Slice 4: billing correctness (P0) | done |
| #1005 | Slice 1: dead-code purge | done |
| #1006 | Slice 2: foundation consolidation | done |
| #1007 | Slice 5: Twilio layer | done |
| #1008 | Slice 6: queue normalization | done |
| #1009 | Slice 7: readiness collapse | done |
| #1010 | Slice 8: campaign/CSV/SMS | done |
| #1011 | Slice 9: UI/hooks | done |
| #1012 | Slice 10: domain schema | done |
| #1013 | Slice 11: v2 infra rebuild | in progress (Phase 1–2 done; Phase 3 blocked on Railway) |
