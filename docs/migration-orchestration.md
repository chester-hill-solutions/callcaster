# Migration orchestration

Live execution tracker for the Supabase → Railway Postgres big-bang migration.

| Doc | Purpose |
|-----|---------|
| [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md) | Canonical plan (grilled decisions) — **updated 2026-06-29** |
| [`migration-delivery-board.md`](./migration-delivery-board.md) | **Master checklist — update task status here** |
| [`migration-ledger-audit.md`](./migration-ledger-audit.md) | Phase 0 migration inventory |
| [`phase-2-drizzle-port-inventory.md`](./phase-2-drizzle-port-inventory.md) | Drizzle port order + metrics |
| [`phase-3-stack-gap-analysis.md`](./phase-3-stack-gap-analysis.md) | v2 stack gap per track |

**Branch:** `feat/supabase-postgres-migration`  
**Railway target:** [`visual-asset-review`](./railway-review-env.md) (env `18ef9173-…`, Postgres **PostgreSQL 18**)

## Objective

Railway-first schema cleanup and full v2 stack on staging; single big-bang production cutover after **77/77 E2E** + manual Twilio smoke.

## Phase status (2026-06-29)

| Phase | Status | Blocker |
|-------|--------|---------|
| 0 — Audit & compose | **Done** | — |
| 1 — Schema transform | **Mostly applied** | Transforms 06/07/09; introspect blocked |
| 1D — Scriptkit packages | Not started | CHS monorepo upstream |
| 2 — Drizzle port | **In progress** | 9/13 modules; **153** PostgREST sites in **81** files; **admin/** complete on Drizzle |
| 3A–3F — Staging stack | Not started | 3D partial (Remix sms-status; Edge IVR unified campaign) |
| 4 — Staging gate | Blocked | Phases 2–3 |
| 5 — Prod cutover | Blocked | Phase 4 |
| 6 — Docs cleanup | Not started | Phase 5 |

## Workstreams

| ID | Phase | Lead focus | Parallel? |
|----|-------|------------|-----------|
| **WS-A** | 1 | `scripts/schema-transform/` → squashed baseline | After prod dump on review |
| **WS-B** | 2 | `createTenantDb` port — telephony API + workspace loaders next | Active — baseline unblocks port |
| **WS-C** | 3 | Auth, SSE, worker, Edge→Bun, storage, Bun | Partial parallel with WS-B after 1.12 |
| **WS-D** | 1D/3 | Scriptkit survey packages | CHS monorepo — always parallel |
| **WS-E** | 1+2 | `household_key` + call screen | After 1.9 SQL |

## Critical path

```text
0 ✓ → 1 (transform + baseline) → 2 (Drizzle) + 3 (v2 stack, parallel)
  → 4 (gate) → 5 (cutover) → 6 (docs)
```

## Hard constraints

- **No prod DDL** on hosted Supabase during staging.
- **Worker replaces all 3 pg_cron jobs** before Phase 4.
- **Storage copy verified** before flip.
- **One-time session invalidation** at Better Auth cutover.
- Do not commit `.env` or rotate secrets in automation.

## Verification

```bash
npm run db:ledger:check
DATABASE_URL=... npm run db:ledger:check
docker compose -f docker-compose.dev.yml up -d
bash scripts/schema-transform/apply-all.sh   # Railway review ONLY
npm run typecheck && npm run lint && npm run test && npm run test:e2e
```

## Orchestrator next dispatch

**Next 5 actions** and full task checkboxes: [`migration-delivery-board.md`](./migration-delivery-board.md).
