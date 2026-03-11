## Testing map (critical flows)

This document is a high-signal index of **critical, high-risk behaviors** in this codebase and the **tests that should cover them**.

### Coverage gate + workflow (current state)

- **Goal**: 100% lines + branches + functions across runtime code (merged across Node + UI + Deno).
- **Runners**
  - **Node (Vitest, `node`)**: `npm run test:coverage:node` → `coverage/vitest-node/lcov.info`
  - **UI (Vitest, `jsdom`)**: `npm run test:coverage:ui` → `coverage/vitest-ui/lcov.info`
  - **Supabase Edge Functions (Deno)**: `npm run test:coverage:deno` → `coverage/deno/lcov.info`
- **Merge + enforce**: `npm run test:coverage:merge` (script: `scripts/coverage/merge-and-check.mjs`)
  - Merges LCOV inputs and fails if any expected runtime file is not at **100%**.
  - **Deprecated**: `twilio-serverless/**` is explicitly ignored (per decision: deprecated).

Notes:
- **Client-only utilities** are covered in the UI suite. Node coverage excludes:
  - `app/lib/**/*.client.*`
  - `app/lib/callscreenActions.ts`
  - `app/lib/csvDownload.ts`
  - `app/lib/errors.client.ts`
  - `app/lib/form-validation.ts`

### Webhooks: Twilio → state transitions + billing

- **Call status webhook (Twilio)**: `app/routes/api.call-status.tsx`
  - **Risks**: signature validation, duplicate delivery (idempotency), incorrect disposition transitions, incorrect billing rounding.
  - **Tests**: `test/call-status-billing.test.ts`, `test/twilio-webhook-validation.test.ts`
- **Auto-dial status webhook (Twilio conference participant)**: `app/routes/api.auto-dial.status.tsx`
  - **Risks**: signature validation, reaching terminal state then regressing, billing charged once, dialer re-triggering.
  - **Tests**: `test/auto-dial-status.test.ts`, `test/twilio-webhook-validation.test.ts`
- **SMS status webhook (Twilio)**: `app/routes/api.sms.status.tsx`
  - **Risks**: signature validation, status normalization, terminal-state monotonicity, webhook fanout, billing charged once.
  - **Tests**: `test/sms-status-webhook.test.ts`, `test/twilio-webhook-validation.test.ts`

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
- **Audience CSV export**: `app/routes/api.audiences.tsx`
  - **Risks**: authz, deterministic headers, CSV injection protection, CRLF/BOM.
  - **Tests**: `test/audience-export.test.ts`
- **Campaign export**: `app/routes/api.campaign-export.tsx`
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

As of the latest `npm run test:coverage` (Vitest node+ui + Deno + merge), the **merged 100% gate is still failing**.

High-signal status:

- **Audience upload API route**: `app/routes/api.audience-upload.tsx` is now **100%** (lines/branches/functions).
- **Many server libs are already at/near 100% in the Node suite**, but the merge gate is still blocked by a mix of:
  - a few **near-100% server modules** with remaining branch gaps
  - a large set of **untested API routes**
  - a large set of **untested UI components/hooks/routes** (UI suite currently only covers a small handful)
  - **Supabase Edge Functions (Deno)** still largely uncovered (many entrypoints are imported but not executed)

Top remaining blockers (smallest surface area first):

- **Near-100% server modules (branch gaps)**:
  - `app/lib/database.server.ts`
  - `app/lib/errors.server.ts`
  - `app/lib/supabase.server.ts`
  - `app/lib/database/contact.server.ts`
- **Near-100% API routes (finish line/branch/function gaps)**:
  - `app/routes/api.audiences.tsx`
  - `app/routes/api.audiodrop.tsx`
  - `app/routes/api.auth.callback.tsx`
  - `app/routes/api.auto-dial.status.tsx`
  - `app/routes/api.call-status.tsx`
- **Untested API routes (0% in merged gate right now)**:
  - `app/routes/api.auto-dial.$roomId.tsx`
  - `app/routes/api.auto-dial.dialer.tsx`
  - `app/routes/api.auto-dial.end.tsx`
  - `app/routes/api.auto-dial.tsx`
  - `app/routes/api.call-status-poll.tsx`
  - `app/routes/api.call.tsx`
  - (and many more; use `coverage/lcov.merged.info` to drive the exact hit list)
- **Supabase Edge Functions (Deno)**:
  - `_shared/*` modules and many function entrypoints currently show very low line coverage; the next step is to **unit-test the shared logic** and refactor entrypoints to **export pure handlers** guarded by `import.meta.main`, so tests can invoke handlers directly without starting servers.
- **UI (JSDOM) breadth**:
  - We need a systematic approach: focus on **small, deterministic components/hooks first**, then expand with targeted smoke renders for “wiring” components.


