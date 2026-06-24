## Testing map (critical flows)

This document is a high-signal index of **critical, high-risk behaviors** in this codebase and the **tests that should cover them**.

### Coverage gate + workflow (current state)

- **Goal**: 100% lines + branches + functions on every **gate-tracked** file (merged across Node + UI + Deno).
- **Runners**
  - **Node (Vitest, `node`)**: `npm run test:coverage:node` → `coverage/vitest-node/lcov.info`
  - **UI (Vitest, `jsdom`)**: `npm run test:coverage:ui` → `coverage/vitest-ui/lcov.info`
  - **Supabase Edge Functions (Deno)**: `npm run test:coverage:deno` → `coverage/deno/lcov.info`
- **Merge + enforce**: `npm run test:coverage:merge` (script: `scripts/coverage/merge-and-check.mjs`)
  - Default CI: fails if any expected runtime file is **missing** from merged LCOV (treated as 0%).
  - Strict mode (`COVERAGE_FULL=1`): also requires **100% lines, branches, and functions** on every gate file.
- **Strict failure report**: `npm run test:coverage:report:strict` — sorted hit list by area (requires `npm run test:coverage` first).
- **Gate scope** (`scripts/coverage/merge-and-check.mjs` via `coverage-lib.mjs`):
  - **Included**: `app/lib/**`, `app/hooks/**`, `app/components/**`, top-level `app/*.{ts,tsx}`, `supabase/functions/**` (minus explicit skips).
  - **Excluded**: all of `app/routes/**` (route tests are integration coverage, not part of the strict gate file list).
- **Deprecated**: `archive/deprecated/twilio-serverless/**` is explicitly ignored.

Notes:

- **Client-only utilities** are covered in the UI suite. Node coverage excludes:
  - `app/lib/**/*.client.*`
  - `app/lib/callscreenActions.ts`
  - `app/lib/csvDownload.ts`
  - `app/lib/errors.client.ts`
  - `app/lib/form-validation.ts`

### Webhooks: Twilio → state transitions + billing

- **Call status webhook (Twilio)**: `app/routes/api+/call-status.tsx`
  - **Risks**: signature validation, duplicate delivery (idempotency), incorrect disposition transitions, incorrect billing rounding.
  - **Tests**: `test/call-status-billing.test.ts`, `test/twilio-webhook-validation.test.ts`
- **Auto-dial status webhook (Twilio conference participant)**: `app/routes/api+/auto-dial/status.route.tsx`
  - **Risks**: signature validation, reaching terminal state then regressing, billing charged once, dialer re-triggering.
  - **Tests**: `test/auto-dial-status.test.ts`, `test/twilio-webhook-validation.test.ts`
- **SMS status webhook (Twilio)**: `app/routes/api+/sms/status.route.tsx`
  - **Risks**: signature validation, status normalization, terminal-state monotonicity, webhook fanout, billing charged once.
  - **Tests**: `test/sms-status-webhook.test.ts`, `test/twilio-webhook-validation.test.ts`
- **Twilio webhook validation helpers**: `app/lib/twilio-webhook.server.ts`
  - **Risks**: wrong auth token resolution (workspace vs main account), missing signature header, callSid vs messageSid policy asymmetry, phone-number lookup for inbound routes.
  - **Tests**: `test/twilio-webhook.server.test.ts`, `test/twilio-webhook-validation.test.ts`

### Billing/idempotency

- **Idempotent transaction inserts**: `app/lib/transaction-history.server.ts`
  - **Risks**: duplicate charges for the same Twilio SID due to re-delivery or multiple handlers.
  - **Tests**: `test/billing-idempotency.test.ts`, `test/call-status-billing.test.ts`

### Auth/authz boundaries (prevent IDOR)

- **Session auth**: `app/lib/supabase.server.ts` (`verifyAuth`)
  - **Risks**: incorrect unauth handling/redirects, leaking data via loaders/actions.
  - **Tests**: `test/supabase.server.test.ts`
- **Workspace authorization**: `app/lib/database/workspace.server.ts` (`requireWorkspaceAccess`)
  - **Risks**: any route accepting `workspace_id` from the client must enforce access.
  - **Tests**: `test/authz.test.ts`, `test/export-authz.test.ts`
- **API keys**: `app/lib/api-auth.server.ts` (`verifyApiKeyOrSession`)
  - **Risks**: key parsing errors, hash mismatch acceptance, workspace mismatch acceptance, timing leaks.
  - **Tests**: `test/api-auth.test.ts`

### CSV exports (security + parity + determinism)

- **CSV contract**: `docs/csv-export-contract.md`
- **Shared CSV utilities**: `app/lib/csv.ts`
  - **Tests**: `test/csv.test.ts`, `test/csv.parse-guards.test.ts`
- **Audience CSV export**: `app/routes/api+/audiences.tsx`
  - **Risks**: authz, deterministic headers, CSV injection protection, CRLF/BOM.
  - **Tests**: `test/audience-export.test.ts`
- **Campaign export**: `app/routes/api+/campaign-export.tsx`
  - **Risks**: ad-hoc CSV building may violate contract (quoting, line endings, injection protection).
  - **Tests**: `test/campaign-export-contract.test.ts`

### UI/client utilities (covered in JSDOM)

- **Call screen client actions**: `app/lib/callscreenActions.ts`
  - **Risks**: wrong request payloads, missing guards when call/contact is absent, queue update semantics, swallowed fetch failures.
  - **Tests**: `test/ui/callscreenActions.test.ts`
- **CSV download**: `app/lib/csvDownload.ts`
  - **Risks**: DOM API failures, URL lifecycle, invalid inputs.
  - **Tests**: `test/ui/csvDownload.test.ts`
- **Client error helpers**: `app/lib/errors.client.ts`
  - **Tests**: `test/ui/errors.client.test.ts`
- **Client logger**: `app/lib/logger.client.ts`
  - **Tests**: `test/ui/logger.client.test.ts`
- **Form validation utilities + hook**: `app/lib/form-validation.ts`
  - **Tests**: `test/ui/form-validation.test.tsx`

### Queueing + ingestion

- **Audience → campaign queue sync**: `supabase/functions/update_queue_by_campaign_audience/index.ts`
  - **Risks**: duplicate queue entries, missed deletes, large-audience performance.
  - **Tests**: `test/queue-sync.test.ts`
- **Audience upload (CSV ingestion)**: `supabase/functions/process-audience-upload/index.ts`
  - **Risks**: CSV parsing edge cases, header mapping mismatch, split-name parsing.
  - **Tests**: `test/audience-upload-parsing.test.ts`

### Server utilities that are now covered

- **Supabase server helpers**: `app/lib/supabase.server.ts`
  - **Tests**: `test/supabase.server.test.ts`
- **Database entrypoint helpers** (parsers, Twilio queue cancellation, legacy conference end): `app/lib/database.server.ts`
  - **Tests**: `test/database.server.test.ts`
- **Server logger**: `app/lib/logger.server.ts`
  - **Tests**: `test/logger.server.test.ts`
- **OpenAPI spec export**: `app/lib/openapi.ts`
  - **Tests**: `test/openapi.test.ts`
- **Queue status helpers**: `app/lib/queue-status.ts`
  - **Tests**: `test/queue-status.test.ts`
- **Queue enqueue helper**: `app/lib/queue.server.ts`
  - **Tests**: `test/queue.server.test.ts`
- **Outreach disposition transitions**: `app/lib/outreach-disposition.ts`
  - **Tests**: `test/outreach-disposition.test.ts`, `test/outreach-disposition-transition.test.ts`
- **getNextContact**: `app/lib/getNextContact.js`
  - **Tests**: `test/getNextContact.test.ts`

### Current merged coverage blockers (next grind)

Run `npm run test:coverage` then `npm run test:coverage:report:strict` for the authoritative sorted hit list.

**Note:** `app/routes/**` (including API routes) are **not** gate files. Route tests still matter for integration confidence, but strict-gate work focuses on **lib, hooks, components, and edge functions**.

High-signal status:

- **Many server libs are already at/near 100% in the Node suite**, but the strict gate is still blocked by:
  - a few **near-100% lib modules** with remaining branch gaps
  - **untested or partially covered hooks** (`app/hooks/**`)
  - a large set of **untested UI components** (UI suite currently covers a small handful)
  - **Supabase Edge Functions (Deno)** still largely uncovered (many entrypoints are imported but not executed)

Top remaining blockers (smallest surface area first — use strict report for exact order):

- **Near-100% lib modules (branch gaps)**:
  - `app/lib/database.server.ts`
  - `app/lib/errors.server.ts`
  - `app/lib/supabase.server.ts`
  - `app/lib/database/contact.server.ts`
  - Newly extracted modules: `conversation-utils.ts`, `workspace-members.ts`, `billing-format.ts`, `campaign-settings.ts`, `auto-dial.server.ts`, `call-screen.server.ts`, `workspace-twilio.server.ts`
- **Supabase Edge Functions (Deno)**:
  - `_shared/*` modules and many function entrypoints currently show very low line coverage; export pure handlers guarded by `import.meta.main` so tests can invoke handlers directly.
- **UI (JSDOM) breadth**:
  - Focus on **small, deterministic components/hooks first**, then expand with targeted smoke renders for wiring components.

### E2E (Playwright browser)

Full browser journeys complement Vitest route tests. See **[e2e-testing.md](e2e-testing.md)** for runbook, seed users, and scenario catalog.

| Area | Vitest (route/unit) | E2E adds |
|------|---------------------|----------|
| Auth / session | `test/supabase.server.test.ts` | Sign-in UI, `?next=` redirect, sign-out |
| RBAC | `test/authz.test.ts` | Nav hidden vs direct URL (`rbac.spec.ts`) |
| Campaign readiness | `test/campaign-readiness.test.ts` | Disabled controls + issue copy in settings UI |
| Twilio webhooks | `test/call-status-billing.test.ts`, etc. | Webhook POST + visible call log / chat updates |
| Surveys | `test/survey-*.route.test.ts` | Public survey pages without auth |
| Billing | `test/confirm-payment.route.test.ts` | Billing page banners and credits display |

- **Run locally**: `npm run test:e2e` (after seed + build + server — see e2e-testing.md)
- **CI**: `.github/workflows/e2e.yml` on main push + nightly only
