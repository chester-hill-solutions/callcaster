# Wave 0 — Quality Baseline

**Generated:** 2026-07-13  
**Branch:** `chore/effects-strictness` @ `5e8716a6`

## Commands run (dirty-tree safe)

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | **Pass** | ~59s |
| `npm run test:node` | **Pass** | 225 files, 1566 passed, 9 skipped |
| `npm run lint` | **Pass** | 0 errors |
| `npm run check:route-server-leaks` | **Pass** | |
| `npm run check:twilio-webhooks` | **Pass** | 16 routes scanned |
| `npm run check:effects` | **Pass** | 88 documented, 0 grandfathered |
| `npm run tools:api:surface:check` | **Pass** | 145 paths |
| `npm run db:ledger:check` | **Pass (repo-only)** | `DATABASE_URL` not set |
| `npm run ci:local` | **Not run** | Includes `git diff --exit-code` — inappropriate on dirty tree |

## Not run this session

| Command | When required |
|---------|---------------|
| `npm run test:ui` | Integration gate |
| `npm run test:coverage` | Phase boundary |
| `npm run test:e2e:compose` | Cutover gate (77/77) |
| `npm run check:type-safety` | After handler WIP integrated |
| `npm run tools:routes:verify` | Wave 1 PR |
| `npm run check:middleware` | Wave 1 SEC PRs |
| `npm run check:credit-writes` | Billing PRs |

## Delivery board metric deltas

| Metric | Board (2026-07-08) | Wave 0 (2026-07-13) |
|--------|-------------------|---------------------|
| Node tests | 1324 pass, 3 skip | 1566 pass, 9 skip |
| API surface entries | 138 | 145 |
| Effects documented | — | 88 |

## Dirty-tree verification strategy

1. Run constituent checks individually on shared branch with user WIP present.
2. Record pass/fail here; do not treat user diff as remediation failure.
3. For remediation PRs: use clean worktree or commit remediation separately, then run `ci:local`.
4. Compare OpenAPI/codegen drift against baseline captured at PR open.

## Pre-existing failures

**None observed** on commands run at HEAD with 139-path dirty tree.
