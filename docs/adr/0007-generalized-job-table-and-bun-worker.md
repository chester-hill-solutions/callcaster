# Generalized job table + Bun worker for long-run, cron, and DB-triggered work

One `job` table (`type` text, `status` text default "queued", `params` jsonb, `workspace_id` FK, `user_id` FK, `idempotency_key` text, `error` text, `result` jsonb, `claimed_until` timestamptz nullable, timestamps). Bun worker process (same codebase, different entry point) claims jobs via `UPDATE ... WHERE status='queued' RETURNING` — atomic CAS, no `claimed_until` needed for simple jobs. `claimed_until` is added only for ACD/predictive time-sensitive claims (superset of quick-canvass's status-only pattern). Idempotency via `buildJobIdempotencyKey({type, workspaceId, payload})` = SHA-256 hash → deterministic key. Worker-side scheduler with missed-cron catch-up on boot. HTTP wake (`POST /internal/jobs/wake` with bearer auth) replaces pg_cron — the web service sends a debounced (10s) wake after every enqueue. Worker runs an HTTP server (`/health` + `/internal/jobs/wake`) in `server` mode, or drains in `drain` mode (cron fallback every 15 min). `api_rate_limit_windows` and `api_idempotency_keys` DB tables replace in-memory `Map` rate limiting and idempotency (which broke under horizontal scaling). Extract as `@chester-hill-solutions/job-worker` shared package. Job chaining: after a job completes with `pendingRemaining > 0`, enqueue another with `chainFromJobId` in the payload. Worker maintenance tasks after drain: `pruneOldWorkspaceEvents`, `pruneOldApiRateLimitWindows`.

## Considered Options

- **Per-domain job tables** — N near-identical claim/status/progress schemas and worker loops.
- **Absorb into Express** — reintroduces in-process debt (exports lost on restart).
- **LISTEN/NOTIFY for event-driven enqueue** — requires DB triggers (banned by ADR-0006) or app-layer `pg_notify()` calls. HTTP wake is simpler and proven.

## References

- `app/lib/campaign-export.server.ts:260,525` (in-process export debt), `app/lib/audience-upload-process.server.ts:264` (in-process upload debt)
- `app/lib/platform-rate-limit.server.ts` (in-memory `Map` — breaks under scaling), `app/lib/platform-idempotency.server.ts` (in-memory `Map`)
- quick-canvass `app/server/job-enqueue.server.ts` (`buildJobIdempotencyKey`, `queueBackgroundJob`), `app/server/job-worker.ts` (claim loop, `UPDATE WHERE status='queued'`), `app/server/worker-wake.server.ts` (debounced HTTP wake), `app/server/job-worker-http.server.ts` (worker HTTP server), `app/db/schema.ts` (`backgroundJobs`, `api_rate_limit_windows`, `api_idempotency_keys` tables)
- pg_cron jobs being replaced: `supabase/migrations/20260414200000_twilio_open_sync_cron.sql`, `supabase/migrations/20260610195000_billing_reconcile_cron_concurrency.sql`, `supabase/migrations/202604140001_number_rental_billing_cron.sql`
