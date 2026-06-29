## Learned User Preferences

- When the user says `do the needful`, continue with the most obvious next implementation, cleanup, or verification steps without waiting for repeated confirmation unless blocked.
- For broad bug, typecheck, test, or coverage sweeps, keep iterating until the issue list is exhausted or a real blocker is reached.
- When implementing from an attached plan whose todos already exist, update the existing todos instead of recreating them and work through the full list before stopping.
- Do not modify, overwrite, or reset the user's existing `.env` or environment variables during setup work.

## Design System

- Prefer [app/components/ui/](app/components/ui/) primitives; use `FormField` for form layout, `Section`/`AuthCard` for page structure, `DataTable`/`TablePagination` for tables, and `toast()` from sonner (single root Toaster). See [docs/design-system.md](docs/design-system.md).

## Routes (React Router 7)

- Route discovery: [app/routes.ts](app/routes.ts) uses `remix-flat-routes` hybrid folders (`workspaces+/`, `api+/`, …). Each route is a **single module** (`folder/route.tsx`); React Router 7 splits `loader` / `action` / UI automatically — no manual `route.server.tsx`.
- Tooling: `npm run tools:routes:folderize`, `tools:routes:verify`, `tools:routes:imports` (see [scripts/](scripts/)).

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
- Supabase Edge Functions called by **Twilio** (`sms-status`, `ivr-status`, `ivr-recording`, `ivr-flow`, `acd-router`) must use `verify_jwt = false` in [`supabase/config.toml`](supabase/config.toml); Twilio sends `X-Twilio-Signature`, not a Supabase JWT. Each validates the signature with the workspace subaccount auth token.
- **`number-rental-billing`** is invoked by pg_cron via `net.http_post` without an `Authorization` header ([`supabase/migrations/202604140001_number_rental_billing_cron.sql`](supabase/migrations/202604140001_number_rental_billing_cron.sql)); it needs `verify_jwt = false`. **`twilio-open-sync`** cron sends `Authorization: Bearer` from `app.settings.supabase_service_role_jwt` ([`supabase/migrations/20260414200000_twilio_open_sync_cron.sql`](supabase/migrations/20260414200000_twilio_open_sync_cron.sql)); default JWT verification can stay on.
- If any Edge Function is wired only from the **Supabase Dashboard** (Database Webhooks, schedules), confirm whether the caller sends a JWT before changing `verify_jwt`; in-repo SQL only registers the two cron jobs above.

## Billing & Credits

- Credits sync is via the `apply_ledger_entry_and_sync_credits` plpgsql RPC ([`supabase/migrations/20260628120000_apply_ledger_entry_and_sync_credits.sql`](supabase/migrations/20260628120000_apply_ledger_entry_and_sync_credits.sql)) — atomic idempotent ledger insert + `workspace.credits` update. The old Postgres trigger (`transaction_history_update_credits`) is dropped. Both app and Edge Function billing paths call this RPC through `insertTransactionHistoryIdempotent`.
- All billing debit sites use `debitAmountFromCredits(credits)` from `shared/pricing.ts` — never hand-roll `amount: -X` (a sign flip silently *adds* credits).
- Idempotency keys are built via `shared/billing-keys.ts` (`smsKey`, `callKey`, `numberRentalPurchaseKey`, `numberRentalCycleKey`, `stripeSessionKey`, `stripeEventKey`). Voice keys are namespaced by billing kind: `call:${sid}:${kind}`. Both `getBillingEventSource` (app) and `categorizeLedgerRow` (shared) classify via `bucketFromIdempotencyKey`.
- Canonical terminal-billable status sets are `TERMINAL_BILLABLE_CALL_STATUSES` and `TERMINAL_BILLABLE_SMS_STATUSES` in `shared/pricing.ts`; reconciliation uses the same set as the debit gate.
- SMS debits by `num_segments` (cast from string on `message.num_segments`), not flat per-message.

## Drizzle / tenant data access (ADR-0004)

- **Scoped client is the only tenant-data accessor for route code.** Use `createTenantDb(workspaceId)` from [`app/server/tenant-db.ts`](app/server/tenant-db.ts) — every table in [`app/db/workspace-scoped-tables.ts`](app/db/workspace-scoped-tables.ts) (28 tables) is auto-filtered by its tenancy column (`workspace` or `workspace_id`) on every read/update/delete and auto-injected on every insert. Use `@/db/schema` for column references in `where`/`orderBy`; never import `@/server/db` or `@/server/admin-db` from a route (enforced by `no-restricted-imports` in [`.eslintrc.cjs`](.eslintrc.cjs)).
- API: `tdb.campaign.findMany({ where, with, orderBy, limit, offset })` (full Drizzle relational opts), `findFirst`, `insert(values)` / `insertMany(values)` (tenancy col stripped from input, auto-set), `update({ set, where })`, `delete({ where })`, `count({ where })`. Pass a second arg `createTenantDb(wsId, txDb)` to scope inside a transaction.
- `withAppCurrentUser(userId, fn)` runs `fn` inside `db.transaction()` with `app.current_user_id` set (transaction-local) so SECURITY DEFINER plpgsql RPCs see the actor; `fn` receives the tx-bound Drizzle instance — compose with `createTenantDb(wsId, tx)`.
- **Non-members get a uniform 404, not 403** (`requireWorkspaceAccess`, `requireWorkspaceLoaderContext`, `withWorkspaceApiLoader/Action`) to avoid workspace-id inference. A member with insufficient role for a min-role-gated route still gets 403.
- No RLS. The last RLS policy (`phone_verification`) is dropped in [`supabase/migrations/20260628130500_adr_0004_drop_phone_verification_rls.sql`](supabase/migrations/20260628130500_adr_0004_drop_phone_verification_rls.sql); `phone_verification` is a global user-scoped table gated in app code by `user_id` (the `verify-audio-session` loader uses the service-role client + explicit `user_id` filter).
