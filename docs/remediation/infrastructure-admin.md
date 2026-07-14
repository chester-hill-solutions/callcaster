# Infrastructure, Admin & Background Jobs Remediation

## Summary

The infrastructure/admin/background-jobs slice has conflicting `job` table schemas, legacy DB triggers with hardcoded secrets, a Bun server that is not production-ready, and missing admin controls. Schema/migration drift is the most critical blocker.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `api+/jobs+/twilio-open-sync.action.server.ts`, `billing-reconcile.action.server.ts`, `number-rental-billing.action.server.ts` | No/mandatory auth; migration passes `workspaceId: NULL` which routes reject. | Add mandatory cron secret; support global mode; build URL from env var. |
| Critical | `scripts/worker.ts`, `app/db/schema.ts`, `drizzle/0003_job.sql`, `client/migrations/20260704000003_extend_job_table.sql` | Job table defined three conflicting ways; worker is a stub; no job producers. | Pick canonical schema; align worker; implement handlers; wire producers OR remove worker. |
| Critical | `drizzle/0000_baseline.sql` | Legacy triggers still active with hardcoded Supabase service-role JWT. | Rotate JWT immediately; add active migration to drop triggers/functions; add secret scanner. |
| Critical | `docs/archive/supabase-migrations/20260628120000_apply_ledger_entry_and_sync_credits.sql` | `apply_ledger_entry_and_sync_credits` RPC only in archive; baseline has old trigger. | Promote to active migration; update baseline; add startup check. |
| Critical | `app/routes/dashboard/$id.route.tsx`, `AudioStreamer.tsx` | Hardcoded external WebSocket with no token/origin/TLS. | Move media-stream service in-repo; authenticate upgrade; use WSS only. |
| High | `server/bun.ts` | Static file path traversal; only serves `/assets/`; no SPA fallback; shallow health checks. | Fix path traversal; align static serving/readiness/logging with Node entry. |
| High | `app/routes/api+/workspaces+/$workspaceId/events.loader.server.ts`, `workspace-events.server.ts` | SSE leaks full row snapshots; new `directPool.listen` per request; abort race leaks connections. | Role-filter payloads; single global LISTEN; unsubscribe on abort. |
| High | `server/admin-db.ts`, `tenant-db.ts` | Shared helpers import `adminDb`; tenant `update` doesn't strip workspace column; `execute` is raw escape hatch. | Remove `adminDb` from route-importable modules; strip workspace in set; remove/rename `execute`. |
| High | `app/routes/admin+/route.action.server.ts`, `requireSudoAdmin.server.ts`, `auth-instance.ts` | Admin actions lack CSRF, origin, sudo re-auth, audit log. | Add CSRF; configure cookie security; require sudo re-auth; add `admin_audit_log`. |
| Medium-High | `server/bun.ts`, `server/index.js`, `logger.server.ts` | Health checks shallow; observability missing; logs unredacted. | Make `/healthz` check DB; add metrics/alerts; unify structured logging with PII scrubbing. |
| Medium | `Dockerfile.worker` | Ignores `bun.lock`; falls back to non-frozen install; copies dev dependencies. | Copy `bun.lock`; use `--frozen-lockfile --production`. |
| Low | `server/index.js` | `trust proxy: true` trusts any forwarded header. | Use trusted proxy list or hop count. |
| Low | `server/bun.ts` | No `x-request-id` response header; error handler omits stack traces. | Set `X-Request-Id`; include stack in logs. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Add mandatory auth to `api+/jobs+/*` and fix cron migration | 1–2 days |
| P0 | Pick canonical `job` schema and align worker | 3–5 days |
| P0 | Rotate hardcoded Supabase JWT and drop legacy triggers | 1 day |
| P0 | Promote billing RPC migration | 1–2 days |
| P0 | Replace external media-stream WebSocket with in-repo authenticated service | 3–5 days |
| High | Fix Bun static path traversal and production parity | 2–3 days |
| High | Role-filter SSE and use single global LISTEN | 2–3 days |
| High | Close no-RLS bypass in tenant DB | 2–3 days |
| High | Harden admin dashboard (CSRF, sudo re-auth, audit log) | 2–3 days |
| Medium | Add health checks, metrics, redaction logger | 2–3 days |
| Medium | Clean up `Dockerfile.worker` | 0.5 day |
| Low | Fix Express trust proxy and Bun request-id logging | 0.5 day |

## Cross-Cutting Concerns

- Migration drift is the foundational blocker. The active migration path must be reconciled before any other deployment.
- The worker, cron, and media-stream decisions are tightly coupled; finishing the worker unlocks reliable cron execution and webhook delivery.
- The Bun server should not be used in production until it is aligned with the Node/Express entry.
- Admin audit logging intersects with the auth slice.

## Railway Environment Topology (audited 2026-07-14)

Findings from diagnosing the crashed PR environment for PR #1042 (`callcaster-pr-1042`):

| Environment | Services | State |
|---|---|---|
| `production` | `callcaster`, `Postgres` | Active, healthy |
| `dev` | `CallCaster`, `callcaster-worker`, `PostgreSQL 18` | Active, current config (`DATABASE_URL`, `BETTER_AUTH_*`, `S3_*`) |
| `staging` | `hearty-expression` only | **Stale** — last successful deploy 2026-06-24, pre Supabase→Postgres/Better Auth cutover; still carries `SUPABASE_*` variables, lacks `DATABASE_URL`/`BETTER_AUTH_SECRET` |
| PR envs (ephemeral) | fork of base env | Crash at boot on env validation |

Root cause of PR-env crashes: project settings have `prDeploys: true` with `baseEnvironmentId` = **staging**. Every ephemeral PR environment forks staging's single stale service and Supabase-era variable set, so current code fails `validateRequiredEnv` (`DATABASE_URL`, `BETTER_AUTH_SECRET` missing) and the container crash-loops. PR-env failures are therefore infrastructure noise, not a signal about the PR (CI + E2E remain the gates).

Resolution (2026-07-14, operator): `baseEnvironmentId` re-pointed to `dev`; `prDeploys` left enabled. Future PR environments fork dev's three services. Caveat: the forked `PostgreSQL 18` starts empty, so PR envs need a migrate/seed step before they are usable (until then their crashes remain non-signal).

Post-merge finding (2026-07-14, PR #1042 deploy to dev): dev `CallCaster` crash-loops on boot env validation because several required third-party provider secrets are unset in that environment (details tracked internally, not in this public doc). This predates the PR — dev had no successful `CallCaster` deploy earlier the same day either — and matches the outstanding "Railway env" go-live TODO. Also note: `callcaster-worker` in dev has no repo source configured — it does not auto-deploy on merges to `dev`; its deploy path needs defining.

Follow-ups:
- Fill the unset dev provider secrets (operator), then redeploy `CallCaster` and verify boot.
- Add a migrate/seed step for forked PR-env Postgres, or disable `prDeploys` until one exists.
- Define an auto-deploy path for `callcaster-worker` (currently source-less in dev).
- `hearty-expression` (auto-named service) and the `staging` environment are retirement candidates: either delete them or rebuild staging from dev's service/variable topology.
