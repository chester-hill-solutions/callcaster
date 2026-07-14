# CallCaster Product Architecture

CallCaster is a multi-tenant contact center platform (outbound/inbound calling, SMS, IVR, surveys, credits billing, integrator API). It runs on **Bun + React Router 8**, **Railway Postgres + Drizzle**, **S3-compatible object storage**, and external **Twilio / Stripe / Resend**.

This document is the durable onboarding map for functional layers, deployable services, and the pre-prod resilience program.

## Runtime topology

| Process | Entry | Responsibility |
|---------|-------|----------------|
| **Web app** | `server/bun.ts` | HTTP: SSR UI, JSON APIs, Twilio webhook fast-path, `/healthz` `/readyz` |
| **Worker** | `worker/index.ts` | Polls Postgres `job` table (`FOR UPDATE SKIP LOCKED`), runs handlers |
| **Media stream** | `services/media-stream/` | Live Twilio media streams / transcription (ADR-0030) |

Legacy dual path: Railway function cron services may still POST to `/api/jobs/*`, which now **enqueue** job rows only. Bun worker owns execution. pg_cron HTTP schedules are retired via `client/migrations/20260714120000_retire_pg_cron_http_job_routes.sql`.

## Functional layers

1. **Presentation** — `app/routes/`, `app/components/`, `app/hooks/`
2. **API / auth boundary** — workspace, data-plane, and admin middleware trees (ADR-0031); OpenAPI at `app/lib/openapi.ts`
3. **Domain logic** — `app/lib/`, `shared/`, `vendor/`
4. **Data access** — `createTenantDb` (ADR-0004), Drizzle schema, ledger/queue RPCs
5. **Infrastructure** — `app/server/db.ts`, object storage, Better Auth, Bun server

### Auth boundaries

| Layout | Middleware | Auth |
|--------|------------|------|
| `workspaces+/$id` | workspace | Session + membership |
| `api+/workspaces+/$workspaceId` | data-plane | Session or workspace API key |
| `admin+/` | admin | Session + sudo |
| Twilio / Stripe / `/api/jobs/*` | inline | Signatures / cron secret |

Non-members get **404** (not 403) for workspace probe resistance.

### Domain entities

Workspace → campaigns, contacts, audiences, calls, messages, campaign_queue, inbound queue, transaction_history (credits ledger).

## Resilience workstreams (pre-prod)

| ID | Focus | Status target |
|----|-------|---------------|
| WS-A | Worker deploy + cron cutover | Worker on Railway; HTTP cron enqueues only |
| WS-B | Webhook fast-ack | Status/recording callbacks enqueue side effects |
| WS-C | Realtime producers | `insertWorkspaceEvent` at agent mutations |
| WS-D | Observability | Sentry (env-gated), correlation IDs, dead-letter admin |
| WS-E | Scale prep | Postgres rate limits; `docs/sse-scaling.md` |
| WS-F | Billing ops | Debit audit, reconciliation alerts, credit-floor |
| WS-G | CHS adapters | Thin adapters until jobqueue/pg-realtime/media-library publish |
| WS-H | Tenant leak tests | Cross-workspace 404 assertions |
| WS-I | Media stream caps | Per-workspace backpressure + ops doc |

## Key ADRs

- [0001](adr/0001-bun-as-single-runtime.md) Bun runtime
- [0004](adr/0004-scoped-drizzle-client-no-rls.md) Scoped tenant DB
- [0005](adr/0005-pg-realtime-sse-workspace-events-listen-notify.md) SSE
- [0007](adr/0007-generalized-job-table-and-bun-worker.md) Job worker
- [0011](adr/0011-twilio-subaccount-per-workspace.md) Twilio subaccount per workspace
- [0030](adr/0030-media-stream-bun-service-third-railway-process.md) Media stream process
- [0031](adr/0031-rr8-product-middleware-trees.md) Middleware trees

## Related docs

- [AGENT-PLATFORM-GUIDE.md](AGENT-PLATFORM-GUIDE.md)
- [railway-review-env.md](railway-review-env.md)
- [migration-delivery-board.md](migration-delivery-board.md)
- [pre-prod-resilience-gate.md](pre-prod-resilience-gate.md)
- [twilio-smoke-review-results.md](twilio-smoke-review-results.md)
- [chs-package-adoption.md](chs-package-adoption.md)
- [sse-scaling.md](sse-scaling.md)
- [credit-floor-policy.md](credit-floor-policy.md)
- [billing-debit-audit.md](billing-debit-audit.md)
- [media-stream-ops.md](media-stream-ops.md)
- [manual-test-plan-zero-supabase.md](manual-test-plan-zero-supabase.md)
