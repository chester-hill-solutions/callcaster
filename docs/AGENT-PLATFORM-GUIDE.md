# Agent platform guide — CallCaster

Give this document to coding agents working in **CallCaster** (`chester-hill-solutions/callcaster`). It situates the repo in the CHS product portfolio and defines which concerns belong in shared packages vs this app.

## Identity

| Field | Value |
|-------|--------|
| Product | **CallCaster** — contact center (calling, SMS, IVR, surveys, credits, integrator API) |
| Active branch | **`feat/supabase-postgres-migration`** (PR [#1036](https://github.com/chester-hill-solutions/callcaster/pull/1036)) |
| Internal codename | `callcaster` |
| Sibling products | [SparkFunds](https://github.com/chester-hill-solutions/sparkfunds) (donations), [GoCanvass](https://github.com/chester-hill-solutions/quick-canvass) (canvassing) |

Also read [AGENTS.md](../AGENTS.md) for route conventions, billing rules, tenant DB, and Railway CLI notes.

## Architecture (migration branch)

```text
Clients (dashboard, integrator API, Twilio webhooks)
        │
        ▼
Bun.serve + React Router 8  (server/bun.ts)
        │
        ├── Postgres + Drizzle  (Railway; scoped tenant client)
        ├── S3-compatible storage  (Railway Buckets / MinIO dev)
        ├── Bun worker  (worker/index.ts — jobs/cron; Phase 3C)
        └── External: Twilio, Stripe (credits), Resend
```

**Not in scope for CallCaster:** door-to-door canvassing, walk zones, PostGIS turfs — that is [GoCanvass](https://github.com/chester-hill-solutions/quick-canvass). Coordinate via shared packages and APIs, do not duplicate canvass features (ADR-0026).

## CHS platform packages

Install from GitHub Packages (`@chester-hill-solutions/*`). Setup: [chester-hill-solutions/docs/USING-PACKAGES.md](https://github.com/chester-hill-solutions/chester-hill-solutions/blob/main/docs/USING-PACKAGES.md).

### Wired today

| Package | Use in CallCaster |
|---------|-------------------|
| `scriptkit-call-script-core` | Campaign script schema, migration, routing (palette `callcaster`) |
| `scriptkit-call-script-react` | Script editor UI |

Vendored under `vendor/scriptkit/` until published semver is stable.

### Adopt from packages — do not reimplement

These are **planned on this branch** (Phase 3). When touching auth, jobs, or realtime, **use the package** rather than copying from GoCanvass or inventing parallel code.

| Package | Phase | Replaces |
|---------|-------|----------|
| `auth`, `auth-postgres`, `auth-react-router` | 3A | Supabase Auth, `verifyAuth` |
| `pg-realtime` | 3B | Supabase Realtime, `useSupabaseRoom` |
| `jobqueue` | 3C | pg_cron HTTP jobs, in-process exports, Edge long-run |
| `pglite` | tests | Ad-hoc test DB setup |
| `media-library` | 3E | Direct S3 calls for recordings/media |
| `contact-import` | audience upload | Custom CSV/audience upload logic where overlap exists |
| `http`, `errors`, `validation` | incremental | One-off response/error helpers |

**Source of truth for migration steps:** [docs/supabase-postgres-migration-plan.md](./supabase-postgres-migration-plan.md), [docs/phase-3-stack-gap-analysis.md](./phase-3-stack-gap-analysis.md), [docs/adr/](./adr/).

### Keep in this repo (product-specific)

- Twilio voice/SMS/IVR webhooks and campaign queue RPCs (`claim_campaign_queue_contacts`, etc.)
- Workspace API key auth (`workspace_api_key`, SHA-256) — not Better Auth's user-scoped API keys
- Credit billing, Stripe checkout webhooks, ledger idempotency ([AGENTS.md](../AGENTS.md) billing section)
- Scoped Drizzle tenant client (`createTenantDb`) — ADR-0004
- Public integrator OpenAPI surface (`app/lib/openapi.ts`)
- Survey subsystem (decouple later; do not merge into GoCanvass)

## Agent rules

1. **Prefer packages over ports.** If GoCanvass or SparkFunds already proved a pattern in `@chester-hill-solutions/*`, import it — do not copy-paste SSE, job polling, or auth glue into `app/`.
2. **Tenant scope.** Route code uses `createTenantDb(workspaceId)` only; never import admin DB from routes.
3. **No Supabase product surfaces.** No new `@supabase/*` usage, Edge Functions, RLS, or Storage calls on this branch.
4. **Migration ledger.** Schema changes go through `drizzle/`; follow existing migration scripts and ledger checks.
5. **Twilio webhooks** stay on Bun routes with signature validation — never session auth on webhook paths.
6. **Do not modify `.env`** during agent setup unless the user explicitly asks.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e:compose   # full stack: Postgres + MinIO
```

Production entry: `npm start` (Bun), `npm run worker`.

## Cross-repo pointers

| Need | Look at |
|------|---------|
| Auth stack reference (furthest along) | SparkFunds `pg-migration` — `apps/web`, ADR-013 |
| SSE / workspace events origin | GoCanvass — `app/features/workspace-events/`, `app/server/workspace-events-stream.server.ts` |
| Job polling origin | GoCanvass — `background_jobs`, `packages/worker` |
| Package APIs | [chester-hill-solutions](https://github.com/chester-hill-solutions/chester-hill-solutions) `packages/*/README.md` |
| Launch provisioning | Adagio `packages/adagio/providers/callcaster/` (internal monorepo) |

## When unsure

- Platform vs product boundary → this doc + ADR-0026 (calling-only scope)
- Migration status → [docs/migration-delivery-board.md](./migration-delivery-board.md)
- v2 target architecture → [docs/v2-architecture-plan.md](./v2-architecture-plan.md) (superseded for execution by migration plan + ADRs)
