Always talk in ASD-STE100 Simplified Technical English.
Always talk to me like I have ADHD.

## Learned User Preferences

> **Platform context:** Read [docs/AGENT-PLATFORM-GUIDE.md](docs/AGENT-PLATFORM-GUIDE.md) for CHS portfolio role, shared `@chester-hill-solutions/*` packages, and migration-branch boundaries before cross-cutting work.

- When the user says `do the needful`, continue with the most obvious next implementation, cleanup, or verification steps without waiting for repeated confirmation unless blocked.
- **Atomic PRs:** Each PR is one logical concern (one issue/decision) with all its changes and nothing else. Plan work as PR-sized chunks aligned to a single ticket before implementing; keep the diff small and reviewable, and do not bundle unrelated fixes, refactors, or cleanup into a PR.
- **Full `npm run ci:local` green before every push/PR — no partial gates.** tsc + one suite + a build is NOT the bar; the push runs `check:*` guards, both suites, the production build, bundle guard, and codegen verify, and anything skipped locally surfaces as a red PR (the #1379 Railway deploy failure shipped on partial gates). Deploys ride the same push, so a broken push blocks environments, not just CI.
- **Dual lockfiles: npm AND bun.** This repo installs with npm (`package-lock.json`) but the Railway Docker build installs with bun (`bun.lock`). Adding/changing a dependency requires running BOTH `npm install` and `bun install` — `check:bun-lock` (in ci:local and the quality job) fails when they drift.
- Open-issue job board: [`ISSUE_BOARD.md`](ISSUE_BOARD.md) at repo root lists every open CallCaster issue in verdict lanes. Pick from **Fix now** first (confirmed, exact resolution path). Other lanes: **Verify and close**, **Needs reproduction**, **Needs decision**, **Blocked / split first**, **Duplicates**. Refresh it any time with `npm run tools:issues:board`; it reads live from GitHub via `gh`. Verdicts, root causes, resolution paths, and test gaps come from the audit in [`scripts/issue-board-enrichment/`](scripts/issue-board-enrichment/) (per-lane files, validated on load) — update them when evidence changes (new PR, comment, or reproduction).
- For broad bug, typecheck, test, or coverage sweeps, keep iterating until the issue list is exhausted or a real blocker is reached.
- When implementing from an attached plan whose todos already exist, update the existing todos instead of recreating them and work through the full list before stopping.
- Do not modify, overwrite, or reset the user's existing `.env` or environment variables during setup work.
- When work reveals a repeatable task, always assess whether to document it: use a `.agents/skills/` skill for reusable guided workflows, a `.opencode/tools/` tool for deterministic commands or automation, or a `.opencode/agents/` agent for delegable multi-step work. Add the smallest useful artifact when it will prevent future rediscovery.

## Design System

- Prefer [app/components/ui/](app/components/ui/) primitives (backed by `@chester-hill-solutions/shad-cc`); use `FormField` for form layout, `Section`/`AuthCard` for page structure, `DataTable`/`TablePagination` for tables, and `toast()` from sonner (single root Toaster). See [docs/design-system.md](docs/design-system.md).

## Routes (React Router 8)

- Route discovery: [app/routes.ts](app/routes.ts) uses `remix-flat-routes` hybrid folders (`workspaces+/`, `api+/`, …). Route modules are **split** into a main module (`folder/route.tsx`) with sibling loader and action server files (`*.loader.server.ts` / `*.action.server.ts` suffixes); [app/routes.ts](app/routes.ts) lines 11-12 list both patterns in `ignoredRouteFiles` so they don't become routes themselves.
- **Auth middleware:** `workspaces+/$id` uses [`app/lib/workspace-middleware.server.ts`](app/lib/workspace-middleware.server.ts) → `workspaceContext`; nested `api+/workspaces+/$workspaceId/*` uses [`app/lib/data-plane-middleware.server.ts`](app/lib/data-plane-middleware.server.ts) → `dataPlaneAuthContext`; `admin+/` uses [`app/lib/admin-middleware.server.ts`](app/lib/admin-middleware.server.ts) → `adminContext`. Child loaders read context via `getWorkspaceRouteContext` / `getDataPlaneRouteContext` / `getAdminRouteContext`. Twilio webhooks, `/api/jobs/*`, stripe, and auth catch-all stay outside product middleware. SSE at [`events.loader.server.ts`](app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts) lives under data-plane middleware for auth context but returns a streaming Response directly (see ADR-0005, ADR-0031).
- **Inline auth (not middleware):** These routes intentionally keep inline `verifyAuth` / dual-auth — do not migrate to layout middleware:

| Route module | Reason |
|---|---|
| [`account.security.loader.server.ts`](app/routes/account.security.loader.server.ts) | User-scoped, not workspace |
| [`accept-invite.action.server.ts`](app/routes/accept-invite.action.server.ts) | Public + auth hybrid |
| [`confirm-payment.loader.server.ts`](app/routes/confirm-payment.loader.server.ts) | Stripe return URL |
| [`api+/audiences.loader.server.ts`](app/routes/api+/audiences.loader.server.ts) | Flat `requireDualAuth` |
| [`api+/audiences.action.server.ts`](app/routes/api+/audiences.action.server.ts) | Flat dual-auth |
| [`api+/audience-upload.action.server.ts`](app/routes/api+/audience-upload.action.server.ts) | Flat dual-auth |
| [`api+/audiodrop.action.server.ts`](app/routes/api+/audiodrop.action.server.ts) | Flat dual-auth |
| [`api+/auto-dial/end.action.server.ts`](app/routes/api+/auto-dial/end.action.server.ts) | JSON auth inject |
| [`api+/audiodrop.tsx`](app/routes/api+/audiodrop.tsx) | Route module ref |
- **Auth layout adapter:** Until `@chester-hill-solutions/auth-react-router` is installable, use [`app/lib/auth-layout.server.ts`](app/lib/auth-layout.server.ts) (`createAuthLayoutLoader`, `createRequireSessionUserId`).
- **`@react-router/fs-routes`:** Deferred — `remix-flat-routes` + route tooling baselines remain; evaluate fs-routes only after RR8 is stable in production.
- Tooling: `npm run tools:routes:folderize`, `tools:routes:verify`, `tools:routes:imports` (see [scripts/](scripts/)).
- **Pre-PR CI bar:** `npm run ci:local` mirrors the quality + bundle-guard jobs (typecheck, lint, tests, route-tree verify, API surface/codegen drift, structural guards).
- **Structural guards:** 15 `check:*` commands wired in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — 14 in the `quality` job (`check:route-server-leaks`, `check:twilio-webhooks`, `check:request-body-consumption`, `check:middleware`, `check:credit-writes`, `check:route-authz`, `check:workspace-projection`, `check:effects`, `check:type-safety`, `check:dry`, `check:handlers`, `check:test-mocks`, `check:bun-lock`, `check:lint-ratchet`) plus `check:client-bundle` in `bundle-guard`. That job list also runs `tools:routes:verify`, `tools:api:surface:check`, `db:ledger:check`, `db:bootstrap:check`, `tools:check-file-size` and `ci:codegen:verify`.

## Public APIs (doc-first / Hey API)

- Integrator-facing JSON APIs: OpenAPI in [app/lib/openapi.ts](app/lib/openapi.ts), served at `/api/docs/openapi`. Doc-first workflow and Hey API conventions: [.cursor/skills/hey-api-openapi/SKILL.md](.cursor/skills/hey-api-openapi/SKILL.md).

## Route modules (hybrid `+` folders)

- URL tree is verified with `npm run tools:routes:verify` against `scripts/baselines/route-tree.txt`.
- Under `workspaces+/$id/` and similar nested paths, use `*.route.tsx` for segment modules (e.g. `settings.route.tsx`, `settings/numbers.route.tsx`), not plain `settings.tsx` / `settings/numbers.tsx` — `remix-flat-routes` will not register those.
- Hybrid colocation alternative: `settings+/numbers.tsx` maps to `/settings/numbers`.
- Repair/test import paths: `npm run tools:routes:repair` (includes `fix-route-test-module-paths.mjs`).

## Learned Workspace Facts

- `archive/deprecated/twilio-serverless/**` contains deprecated Twilio Serverless code and can generally be ignored for current runtime and coverage work.
- Local Twilio/calling development uses Localtunnel-style public URLs, and `BASE_URL` should match the current public tunnel URL.
- Queue progress/completion should treat rows with `status = "dequeued"` or a non-null `dequeued_at` as completed work, including duplication dequeues.
- Workspace audio uploads are normalized to canonical MP3 on upload via `ffmpeg`, and production Docker builds install `ffmpeg` for that path.

## Agent Pitfalls (learned the expensive way)

- **e2e flake triage — rerun before diffing.** A failed e2e job is most often a degraded compose env, not your diff. Order of operations: (1) `gh run rerun <run-id> --failed`; (2) only if it persists, compare against a sibling passing run (`gh pr view N --json headRefOid` → check-runs → e2e job log) for the same test; (3) treat background worker errors in the log (`campaign_schedule_sync` "Failed query", Twilio 401s from billing_reconcile) as env noise unless your diff touches that subsystem; (4) only then hunt for a real regression. Red flags that it IS yours: failure count/runtime differs wildly between runs on the same commit, or the failing test's area overlaps your diff.
- **`vi.mock` of shared server modules must spread `importOriginal`.** A literal factory freezes the module's export surface; when the module gains an export, every route test importing it fails with the route's *catch-all* error (e.g. "Campaign status could not be updated") — N unrelated-looking failures for one line of drift. Enforced by `check:test-mocks` (ratchet baseline: `scripts/baselines/test-mock-replace.txt`, rewrite with `npm run tools:test-mocks:baseline`).
- **Timezone-sensitive test assertions: pin `process.env.TZ = "UTC"` inside `vi.hoisted`** at the top of the test file (Intl formatters render in machine-local time; CI runners differ from laptops). Same for fake timers: `vi.useFakeTimers()` + `vi.setSystemTime(...)`.
- **Migrating a component to `role="alert"` (Alert) can shadow e2e tests** that use `getByRole("alert").first()` for a different banner. Grep `e2e/` for `getByRole("alert")` when touching Alert usage, and scope selectors with `.filter({ hasNotText })` where banners can co-exist.
- **Closing an issue invalidates its enrichment record** — the board generator now auto-prunes them on the next `npm run tools:issues:board` (it logs what it pruned), but records still `blockedBy` a pruned number will fail validation: fix the edge in `scripts/issue-board-enrichment/`.
- **`verifyAuth(request, path)` captures a login return-to.** Only pass a return-to when landing back on that page after sign-in is genuinely the right UX (`getSafeRedirectPath` rejects `/signin` and falls back to `/workspaces`). Adding one for a settings page sends every unauthenticated bounce back there post-login (#1317).
- **`waiting` is a schedule-sweep-owned status (#1168).** Durable dispatch chains must not kill themselves on it — defer and re-tick; never transition `waiting → running` outside the sweep.
- **Tautological tests are worse than no tests.** A test whose expectation echoes the implementation (mock returns X → assert X; expected value re-derived from the code's own lookup table; snapshot frozen without intent) stays green while the behavior it pretends to cover rots. Kill checks before trusting a test: delete/patch the implementation line — if the test still passes, it tests mocks, not code. Wiring assertions (`expect(service).toHaveBeenCalledWith(specValue)`) are legitimate ONLY for thin adapters whose unit IS orchestration, and the spec values must come from the contract (issue, Twilio docs, legacy parity), never from reading the function under test. Every behavior claim needs at least one test that would fail if the logic inverted.

## Billing & Credits

- Credits sync is via the `apply_ledger_entry_and_sync_credits` plpgsql RPC ([`client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql`](client/migrations/20260704000004_apply_ledger_entry_and_sync_credits.sql)) — atomic idempotent ledger insert + `workspace.credits` update. The old Postgres trigger (`transaction_history_update_credits`) is dropped. Both app and Edge Function billing paths call this RPC through `insertTransactionHistoryIdempotent`.
- All billing debit sites use `debitAmountFromCredits(credits)` from `shared/pricing.ts` — never hand-roll `amount: -X` (a sign flip silently *adds* credits).
- Idempotency keys are built via `shared/billing-keys.ts` (`smsKey`, `callKey`, `numberRentalPurchaseKey`, `numberRentalCycleKey`, `stripeSessionKey`, `stripeEventKey`). Voice keys are namespaced by billing kind: `call:${sid}:${kind}`. Both `getBillingEventSource` (app) and `categorizeLedgerRow` (shared) classify via `bucketFromIdempotencyKey`.
- Canonical terminal-billable status sets are `TERMINAL_BILLABLE_CALL_STATUSES` and `TERMINAL_BILLABLE_SMS_STATUSES` in `shared/pricing.ts`; reconciliation uses the same set as the debit gate.
- SMS debits by `num_segments` (cast from string on `message.num_segments`), not flat per-message.

## Drizzle / tenant data access (ADR-0004)

- **Scoped client is the only tenant-data accessor for route code.** Use `createTenantDb(workspaceId)` from [`app/server/tenant-db.ts`](app/server/tenant-db.ts) — every table in [`app/db/workspace-scoped-tables.ts`](app/db/workspace-scoped-tables.ts) (26 tables) is auto-filtered by its tenancy column (`workspace` or `workspace_id`) on every read/update/delete and auto-injected on every insert. Use `@/db/schema` for column references in `where`/`orderBy`; never import `@/server/db` or `@/server/admin-db` from a route (enforced by `no-restricted-imports` in [`.eslintrc.cjs`](.eslintrc.cjs)).
- API: `tdb.campaign.findMany({ where, with, orderBy, limit, offset })` (full Drizzle relational opts), `findFirst`, `insert(values)` / `insertMany(values)` (tenancy col stripped from input, auto-set), `update({ set, where })`, `delete({ where })`, `count({ where })`. Pass a second arg `createTenantDb(wsId, txDb)` to scope inside a transaction.
- `withAppCurrentUser(userId, fn)` runs `fn` inside `db.transaction()` with `app.current_user_id` set (transaction-local) so SECURITY DEFINER plpgsql RPCs see the actor; `fn` receives the tx-bound Drizzle instance — compose with `createTenantDb(wsId, tx)`.
- **Non-members get a uniform 404, not 403** (`requireWorkspaceAccess`, `requireWorkspaceLoaderContext`, `withWorkspaceApiLoader/Action`) to avoid workspace-id inference. A member with insufficient role for a min-role-gated route still gets 403.
- No RLS. The last RLS policy (`phone_verification`) is dropped in [`client/migrations/20260715140000_drop_legacy_rls.sql`](client/migrations/20260715140000_drop_legacy_rls.sql); `phone_verification` is a global user-scoped table gated in app code by `user_id` (the `verify-audio-session` loader uses the service-role client + explicit `user_id` filter).

## Railway (CallCaster project)

**Default: use the CLI** for deploy, cleanup, env vars, DB ops, and anything that must run non-interactively. Use **MCP for read-only inspection** (status, logs, deployments). Avoid `railway-agent` for multi-step infra unless the CLI cannot do it.

### CLI (prefer `@railway/cli` ≥ 5.x)

- Link context first: `railway environment <env>` → `railway service <name>` → `railway status`.
- **CallCaster** project (`32b36c6c-5f3d-463b-8c7f-bbcd70351e8f`); **migration/review env** is **`visual-asset-review`** (`18ef9173-4b33-4a62-9b94-9dfc7a36eb05`) — [dashboard](https://railway.com/project/32b36c6c-5f3d-463b-8c7f-bbcd70351e8f?environmentId=18ef9173-4b33-4a62-9b94-9dfc7a36eb05); see [`docs/railway-review-env.md`](docs/railway-review-env.md).
- App service **`callcaster-review`**; DB service **`PostgreSQL 18`** (PG 18.4, latest stable template: `railway deploy -t postgres-18`).
- **Deploy / config:** `railway redeploy --yes`, `railway variables --set 'KEY=value'`, `railway variables --set 'DATABASE_URL=${{PostgreSQL 18.DATABASE_URL}}'`.
- **Cleanup:** `railway service list --json`, `railway service delete --service <id> --yes`, `railway volume delete -v <name> --yes` (requires CLI 5+; old 4.x has no `service delete` and prompts fail without TTY).
- **DB from local machine:** `railway run -- bash -lc '…'` and use **`$DATABASE_PUBLIC_URL`** inside the script — plain `railway run psql "$DATABASE_URL"` fails locally because `DATABASE_URL` uses `postgres.railway.internal`.
- **Templates:** `railway deploy -t postgres-18` (or `postgres-17`); `railway add --database postgres` is interactive-only.

### MCP (`user-Railway`)

- **Good for:** `list-projects`, `list-services`, `get-status`, `list-deployments`, `get-logs` — quick read-only checks without linking cwd.
- **`accept-deploy`** — commits **all** staged environment changes and deploys; destructive; only when the user explicitly wants deploy.
- **`railway-agent`** — multi-step ops but unreliable here: truncates service IDs, **`commitStagedChangesTool` often fails**, may **`discardStagedChangesTool`** and revert work, dual-volume PATCH merges instead of replacing. Prefer CLI when agent reports “staged” or “send another message”.
- MCP **hides secret values** in config; use CLI `railway variables` / `railway run` when you need to run migrations against the DB.

### Postgres on Railway (this repo)

- App **`DATABASE_URL`** should reference the single Postgres service variable (e.g. `${{PostgreSQL 18.DATABASE_URL}}`).
- Schema/data restore: dump from linked Postgres (`client db dump --linked` + **PostgreSQL 17+ `pg_dump`** locally), restore via `psql "$DATABASE_PUBLIC_URL"`, seed `AUTH_migrations.schema_migrations`, then `client db push --db-url "$DATABASE_PUBLIC_URL" --yes`.
- One volume per Postgres service; changing major PG version requires a **fresh volume** (cannot reuse PG18 data dir on PG17 image).
