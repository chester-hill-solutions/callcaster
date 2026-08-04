# Billing debit-site idempotency audit

**Audit date:** 2026-07-14  
**Scope:** All `transaction_history` / `workspace.credits` write paths in the CallCaster app runtime.

## Canonical write path

All ledger mutations must go through:

1. **`insertTransactionHistoryIdempotent`** (`app/lib/transaction-history.server.ts`) → Postgres RPC **`apply_ledger_entry_and_sync_credits`**
2. **DEBIT amounts** via **`debitAmountFromCredits(credits)`** from `shared/pricing.ts` (never hand-roll `amount: -X`)
3. **Idempotency keys** via builders in **`shared/billing-keys.ts`** (re-exported from `@/lib/billing-keys`)

Direct `workspace.credits` assignment is banned (ADR-0006); the legacy `transaction_history_update_credits` trigger is dropped.

## DEBIT sites (production)

| Site | Trigger | Key builder | Amount | Status |
|------|---------|-------------|--------|--------|
| `app/lib/twilio-call-status.server.ts` | Terminal call + duration > 0 | `callKey(sid)` | `debitAmountFromCredits(voiceCreditsFromDurationSeconds(...))` | ✅ Compliant |
| `app/lib/worker/webhook-side-effects.server.ts` | Terminal outbound SMS/MMS status (worker job enqueued by `/api/sms/status`) | `smsKey(sid)` | `debitAmountFromCredits(segments × SMS_SEGMENT_CREDITS or MMS_CREDITS)` | ✅ Compliant |
| `app/lib/number-rental-billing.server.ts` | Monthly rental cron | `numberRentalCycleKey(numberId, cycleKey)` | `debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS)` | ✅ Compliant |
| `app/lib/platform-workspace-numbers.server.ts` | Number purchase | `numberRentalPurchaseKey(workspaceId, numberSid)` | `debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS)` | ✅ Compliant |

**Notes:**

- Voice keys use **`callKey(sid)` only** (kind is not part of the key). Historical `call:<sid>:ivr` / `call:<sid>:staffed` rows are matched via `legacyCallKeys` for reconciliation lookups only.
- Number rental cron checks balance **before** debiting so unpaid numbers are not silently driven negative.
- `number-rental-billing.server.ts` duplicates `NUMBER_RENTAL_MONTHLY_CREDITS = 100` locally; value matches `shared/pricing.ts` (cosmetic only).

## CREDIT sites (not debits; included for completeness)

| Site | Key builder | Status |
|------|-------------|--------|
| `app/routes/api+/stripe-webhook.action.server.ts` | `stripeSessionKey(sessionId)` | ✅ |
| `app/lib/platform-billing.server.ts` (checkout poll + redirect confirm) | `stripeSessionKey(sessionId)` | ✅ |
| `app/lib/database/workspace.server.ts` (welcome grant) | `welcomeCreditsKey(workspaceId)` | ✅ Fixed in WS-F audit |

`stripeEventKey` exists for future/event-based Stripe paths but is not wired to a write site today.

## Edge functions / Deno

No active Edge Function debit paths remain in-repo; SMS and call status billing run through app routes that enqueue Bun worker jobs (`/api/sms/status` → `webhook-side-effects.server.ts`, `/api/call-status` → worker → `twilio-call-status.server.ts`) or bill synchronously (`/api/ivr/status`, `/api/auto-dial/status`). Route-level coverage is inventoried in [credit-handler-inventory.md](./credit-handler-inventory.md).

## Violations found

| Issue | Resolution |
|-------|------------|
| Welcome grant used hand-rolled `` `welcome-credits:${id}` `` | Added `welcomeCreditsKey()` to `shared/billing-keys.ts`; updated `workspace.server.ts` |

No hand-rolled `amount: -X` in production code. Test fixtures use negative amounts intentionally to simulate ledger rows.

## Grep methodology

```bash
rg 'insertTransactionHistoryIdempotent|apply_ledger_entry' --glob '*.{ts,tsx}'
rg 'type:\s*["\']DEBIT["\']' --glob '*.{ts,tsx}'
rg 'amount:\s*-' --glob '*.{ts,tsx}'   # production: none outside tests
```

## Ongoing guardrails

- `check:credit-writes` CI guard flags direct `workspace.credits` mutation
- `app/server/db-health.server.ts` requires `apply_ledger_entry_and_sync_credits` at startup
- Reconciliation uses `TERMINAL_BILLABLE_CALL_STATUSES` / `TERMINAL_BILLABLE_SMS_STATUSES` from `shared/pricing.ts` — same sets as debit gates
