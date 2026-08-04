# Twilio smoke checklist — review env results

**Environment:** Railway `visual-asset-review` / `dev` (`18ef9173-4b33-4a62-9b94-9dfc7a36eb05`)  
**App URL:** https://callcaster-review-visual-asset-review.up.railway.app  
**Date:** 2026-07-14  
**Plan:** [manual-test-plan-zero-supabase.md](./manual-test-plan-zero-supabase.md) categories 1–8

## Gate status: BLOCKED (infra)

| Check | Result | Notes |
|-------|--------|-------|
| App `/healthz` | FAIL | `CallCaster` service CRASHED — required secrets `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_APP_SID`, `TWILIO_PHONE_NUMBER`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY` are empty on the service |
| App `/readyz` | FAIL | Same as above |
| Worker deployed | IN PROGRESS | `callcaster-worker` service created; `job` table aligned to text status/`workspace_id`; HTTP `/api/jobs/*` enqueue-only |
| Manual Twilio voice/SMS | BLOCKED | Cannot execute without parent Twilio credentials + healthy app |

## Actions required before re-run

1. Set parent Twilio / Stripe / Resend secrets on `CallCaster` (and references on `callcaster-worker`).
2. Redeploy / restart `CallCaster` until `/readyz` returns ready.
3. Execute categories 1–8 from the manual test plan against the review URL.
4. Record pass/fail per category below.

## Category results (to complete after secrets restored)

| Category | Status | Notes |
|----------|--------|-------|
| 1 Auth / session | Not run | |
| 2 Workspace / onboarding | Not run | |
| 3 Outbound call | Not run | |
| 4 Inbound / IVR | Not run | |
| 5 SMS / MMS | Not run | |
| 6 Queue / dialer | Not run | |
| 7 Billing / credits | Not run | |
| 8 Webhooks / status | Not run | |

## Code-path smoke (local / CI substitute)

Until live Twilio secrets are present, treat these as the automated substitute gate:

- `npm run test -- test/worker.test.ts test/enqueue-job.test.ts`
- Webhook fast-ack unit coverage (call/sms/recording enqueue paths)
- `npm run ci:local` for typecheck/lint/tests once green
