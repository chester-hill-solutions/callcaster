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

## Business onboarding (2026-07-17, corrected 2026-07-18)

Locked in [`business-onboarding-simplification-plan-2026-07-17.md`](./business-onboarding-simplification-plan-2026-07-17.md):

- **Always-required prefix:** workspace name → **business basics** (legal name, website, use-case, samples, operating country, …) → goal selection (with SMS TFV/A2P when the goal needs it).
- **Path wizard after goal:** audience → first number → script (IVR/SMS) → campaign → credits → launch — stays in `/onboarding`, goal-scoped.
- **Hard redirect / sidebar lock:** until business baseline + goal are complete; not for missing number/address alone after that.
- **Workspace Today:** soft handoff + checklist that deep-links back into wizard steps; capability gates (service address, SMS compliance) remain at number/SMS boundaries.
- **eventually_due / warning:** credits (Today may still prioritize billing at balance ≤ 0).
- **Emergency address:** collect at voice number rental when required.
- **Rejected:** short intake (name → goal only) that exits to Today as the primary path setup surface.

## Credit facet ratchet (2026-07-17)

Strictness-ratchet cycle 3 (`check:handlers` credit facet):

- **Bidirectional enforcement:** a route matching a credit-write signal must declare `"credit"`; a route declaring `"credit"` must match a signal. Balance reads / credit-floor gates do not qualify.
- **Signals cover async billing:** worker job enqueues (`CALL_STATUS_SIDE_EFFECTS_JOB_TYPE`, `SMS_STATUS_SIDE_EFFECTS_JOB_TYPE`, `number_rental_billing`) count as credit-write paths of the enqueuing route.
- **Two credit gates stay separate:** `check:credit-writes` bans direct `workspace.credits` mutation (write mechanism, ADR-0006); the `credit` facet inventories route entry points. Documented in `docs/handler-strictness.md`.
- **Generated inventory:** `docs/credit-handler-inventory.md` is emitted by every `check:handlers` run; `ci:local`'s trailing `git diff --exit-code` catches drift.
- **Fixes landed:** 6 under-declarations (workspace-create ×2, call-status, sms/status, auto-dial/status, number-rental-billing cron) and 2 over-declarations (sms, chat_sms send routes) corrected; `createCronEnqueueAction` gained `extraSideEffects`.
