# Production Billing Ops Verification

Run after deploy or when investigating billing drift.

## Database

```sql
-- Credits trigger exists
select tgname
from pg_trigger
where tgname = 'transaction_history_update_credits';

-- Idempotency index
select indexname
from pg_indexes
where tablename = 'transaction_history'
  and indexname = 'idx_transaction_history_workspace_type_idempotency_key';

-- pg_cron jobs
select jobname, schedule, active
from cron.job
where jobname in (
  'twilio_open_sync_every_5m',
  'number_rental_billing_daily',
  'twilio_billing_reconcile_daily'
);
```

Expected jobs:

| Job | Schedule | Edge function |
|-----|----------|---------------|
| `twilio_open_sync_every_5m` | `*/5 * * * *` | `twilio-open-sync` |
| `number_rental_billing_daily` | `15 3 * * *` | `number-rental-billing` |
| `twilio_billing_reconcile_daily` | `30 4 * * *` | `twilio-billing-reconcile` |

## Required GUCs / secrets

```sql
show app.settings.edge_functions_base_url;  -- or supabase_functions_url
show app.settings.supabase_service_role_jwt;
```

Edge / project secrets (Dashboard → Edge Functions → Secrets):

- `NUMBER_RENTAL_CRON_SECRET` — required for `number-rental-billing` (100 credits/month at Option B)

## Manual reconciliation spot-check

1. Admin → workspace → Twilio ops portal → **Billing Reconciliation**
2. Compare SMS / voice variance badges to Twilio console Usage for the same 30-day window
3. Investigate positive **entity audit gaps** (billable rows without ledger debits)

## Nightly reconcile logs

Supabase Edge Function logs for `twilio-billing-reconcile` emit `twilio-billing-reconcile variance` warnings when material drift is detected. Each run also persists `billingReconciliationSnapshot` on `workspace.twilio_data` for admin alerting.

Structured debit logs use the `billing.transaction` event (app logger + Edge `console.info`).

## Admin repair actions

Workspace Twilio ops portal → **Billing Reconciliation**:

- **Run reconciliation** — on-demand Twilio vs ledger report; stores snapshot
- **Repair open sync** — invokes `twilio-open-sync` scoped to this workspace (backfills stale SMS/call statuses and missing debits)

## Local verification

```bash
npm run typecheck && npm run typecheck:deno && npm run test -- test/billing-reconciliation.test.ts
node scripts/check-twilio-webhook-coverage.mjs
```
