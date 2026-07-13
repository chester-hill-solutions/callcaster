# Wave 0 — API Parity Ledger

**Generated:** 2026-07-13 (read-only)  
**Inventory:** `app/lib/api-surface.ts` — **145** entries  
**OpenAPI:** `public-api.json` · `integrator-api.json` (3 paths) · `complete-api.json`  
**Claims source:** `docs/migration-delivery-board.md` — not auto-proved cross-branch

## Status legend

| Status | Meaning |
|--------|---------|
| **proved** | Route + inventory + tests; no open hard-cut |
| **partial** | Callable but incomplete integrator contract |
| **missing** | Planned canonical surface not implemented |
| **deprecated-hard-cut** | Live legacy route; orchestration mandates delete |

## Critical domain ledger

| Domain | Capability | Status | Notes |
|--------|------------|--------|-------|
| Meta | Route inventory ↔ tree | **proved** | `tools:api:surface:check` pass |
| Meta | Full API-01 programmatic parity | **missing** | Post-cutover |
| Meta | SEC-07 capability registry | **missing** | |
| Workspace | List/create workspaces | **proved** | |
| Workspace | Scoped GET/PATCH/DELETE | **partial** | OpenAPI documented; GET dual-auth, PATCH admin+, DELETE owner |
| Workspace | `POST /api/workspace` | **deprecated-hard-cut** | SEC-01 — deleted |
| Workspace | Members, API keys, numbers, billing | **partial** | Session trust-root |
| Campaigns | create-with-script integrator | **proved** | 3 integrator paths |
| Campaigns | Legacy CRUD + data-plane | **partial** | Weak schemas |
| Campaigns | Queue/audience legacy | **partial** | DATA-01 tenancy gaps |
| Dialer | Manual dial, auto-dial session | **partial** | Session UI paths |
| Dialer | `POST /api/auto-dial/dialer` | **deprecated-hard-cut** | SEC-02 unauthenticated |
| Dialer | Workspace dialer start (planned) | **partial** | SEC-02 cutover route shipped; OpenAPI `startCampaignDialer` |
| Dialer | Twilio callbacks | **proved** | Signature validated |
| SMS | Campaign + chat SMS integrator | **proved** | |
| SMS | Conversations read | **partial** | Read-only API key |
| Webhooks | Provider (Twilio/Stripe) | **proved** | complete-api.json |
| Webhooks | Customer configure | **partial** | Session-only |
| Webhooks | Customer delivery | **partial** | SEC-04 raw fetch |
| Surveys | Admin CRUD | **partial** | Session-only |
| Surveys | Public respondent | **partial** | SURVEY-01 open |
| Surveys | Data-plane reads | **partial** | API-key reads only |

## Summary counts (critical integrator-facing)

| Status | Count |
|--------|------:|
| proved | 11 |
| partial | 28 |
| missing | 2 |
| deprecated-hard-cut | 2 |

## Board contradictions

1. Branch mismatch: board on `feat/supabase-postgres-migration`; handoff on `chore/effects-strictness`.
2. Board 4.5 = inventory sync, not API-01 full parity.
3. Board 3C.6 dialer Done ≠ SEC-02 secure — HTTP surface is deprecated-hard-cut.
4. `docs/api-workspace-admin.md` updated for scoped workspace routes (legacy `POST /api/workspace` removed).

## Explicit exclusions (API-01)

Trust-root / owner-session only (no API key at cutover):

- Member invite and role assignment
- API key lifecycle
- Ownership transfer
- Billing checkout session creation
- Onboarding / Trust Hub mutations

Provider callbacks (Twilio signature, not capability IDs):

- All routes in `complete-api.json` with `twilioSignature`

Internal / worker (not public integrator API):

- `/api/jobs/*`, predictive dialer next-turn (in-process after SEC-02)

Public respondent (separate SURVEY-01 model):

- `/survey/:id`, `/api/survey-answer`, `/api/survey-complete`
