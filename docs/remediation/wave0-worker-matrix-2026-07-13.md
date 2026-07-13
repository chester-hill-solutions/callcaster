# Wave 0 — Worker / Job Matrix

**Generated:** 2026-07-13

## Registered job types and producers

| Job type | Handler | Producer(s) | Decision |
|---|---|---|---|
| `twilio_open_sync` | Implemented | pg_cron HTTP only; admin inline trigger | **Implement** — coordinator + per-workspace children |
| `workspace_twilio_compliance` | Implemented | `enqueueWorkspaceComplianceJob()` onboarding/admin | **Keep** — only working enqueue path |
| `billing_reconcile` | Implemented | pg_cron HTTP; admin inline | **Implement** — coordinator; cron sends NULL → **400** |
| `number_rental_billing` | Implemented | pg_cron HTTP | **Implement** — coordinator; NULL → **500** |
| `audience_upload` | Implemented | Fire-and-forget in upload route (bypasses worker) | **Implement** — enqueue from route |
| `low_credit_notify` | Implemented + self-reschedule | Handler self-insert; optional HTTP | **Implement** — durable schedule |
| `twilio_webhook_audit` | Implemented + self-reschedule | Manual SQL seed only | **Implement** — durable schedule + seed migration |
| `campaign_export` | **Stub throws** | Fire-and-forget in-process | **Implement** — replace stub |
| `campaign_dispatch` | **Stub throws** | None (predictive uses HTTP dialer chain) | **Implement** — automated message/robocall only |
| `webhook_delivery` | **Stub throws** | Inline synchronous fanout | **Implement** — Wave 3 with SEC-04b |

**Producer gap:** 1/10 types has a real enqueue producer today.

## Billing cron regression (BILL-01)

Migration `client/migrations/20260704000000_update_pg_cron_to_remix_routes.sql` posts `workspaceId: NULL` to:

- `/api/jobs/twilio-open-sync` → fails with empty workspace
- `/api/jobs/number-rental-billing` → throws required workspaceId
- `/api/jobs/billing-reconcile` → 400 Missing workspaceId

`/api/jobs/low-credit-notify` sweeps all workspaces when omitted — only working global path.

## Local poller vs `@chester-hill-solutions/jobqueue`

| Capability | Local `poll-jobs.server.ts` | CHS jobqueue |
|---|---|---|
| Adopted | Yes | **No** (not in package.json) |
| Claim fencing | **Missing** | **Missing** |
| Lease heartbeat | Yes | No |
| Stale reclaim | Yes | No |
| Idempotency key | Column exists, ignored | Not implemented |
| Scheduling | `retry_at` hack | `scheduled_for` |
| Typed registry | Untyped map | 2 Zod types (other product) |

**Recommendation:** Extend and publish CHS jobqueue (fencing, heartbeat, idempotency, recurrence, typed registry), migrate handlers, delete local poller after parity proof.

### Proposed CHS extension API (pending owner approval)

- `ClaimToken` + conditional complete/fail/cancel by `(jobId, claimToken)`
- `extendLease(jobId, claimToken, workerId)`
- `enqueueIdempotent({ type, workspaceId, idempotencyKey, payload, scheduledFor? })`
- `registerJobHandler<T>(schema, handler)` consumer-side registry
- Schema mapping adapter: integer serial ↔ text UUID (migration period)

### Publish / adoption sequence

1. Implement extensions in CHS monorepo with package tests.
2. Publish `@chester-hill-solutions/jobqueue` ≥ agreed version.
3. CallCaster: install, align job table columns, migrate handlers one type at a time.
4. Deploy `callcaster-worker` on Railway review; prove stale-worker rejection.
5. Wire coordinator recurrence rows; retire HTTP pg_cron as source of truth.
6. Delete local poller only after producer/handler parity demonstrated.
