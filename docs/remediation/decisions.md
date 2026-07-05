# Remediation Decisions

Decisions captured during the grilling session that shape the implementation plan.

## Background Work

- **Finish the Bun worker.** Cron jobs will stop being exposed as HTTP routes.
- **Canonical schema:** the Drizzle `job` table is the source of truth, extended with `attempt_count`, `max_attempts`, `retry_at`, `claimed_until`, `started_at`, `completed_at`, `failed_at`, `dead_letter_reason`, `error_message`.
- **Deployment model:** hybrid. Long-running worker for real-time jobs (call status, IVR/SMS webhooks, CSV exports, billing, sync, webhook delivery). Drain/cron enqueues scheduled jobs into the same table.
- **Job queue stays in Postgres.** Redis is used for rate limiting and caching, not as the job broker.

## Media Stream

- Build a separate Bun media-stream service in this repo.
- Authenticate WebSocket upgrades with a short-lived signed token issued by the main app dashboard loader.
- Use WSS only; remove `localhost:3000` dev endpoint from production bundles.

## Data Access

- Code-level scoping, no RLS.
- Remove `adminDb` from route-importable modules.
- Strip workspace column in tenant `insert`/`update`.
- Remove or rename raw `execute` escape hatch.
- Add FK constraints and cascade deletes on join tables.

## Twilio

- Twilio signature validation as both server middleware and route wrapper.
- No main-account token fallback in non-production.
- Use canonical `BASE_URL() + pathname` for validation.

## API Keys

- Derive a globally unique prefix from the random secret.
- Add unique index on `key_prefix`.
- Workspace-scoped keys with creator role snapshot.

## Rate Limiting

- Redis-backed in production, in-memory fallback for local dev.
- Key by API key ID for integrator routes, IP for public routes, user ID for authenticated HTML routes.

## Testing

- Adversarial security test suite per slice.
- Concurrency, cross-workspace, billing-kind, and signature/replay tests.

## Deployment

- Slice-by-slice deployment of P0 items.
- Adversarial tests pass before each merge.

## Documentation

- New remediation docs in `docs/remediation/`.
- Update existing docs only after a fix is shipped.
