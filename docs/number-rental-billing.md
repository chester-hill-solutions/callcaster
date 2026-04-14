# Number Rental Billing

This document describes how monthly billing works for rented phone numbers (`workspace_number.type = "rented"`), including reminder emails, grace period behavior, and automatic release.

## Scope

- Initial purchase charge when a number is rented.
- Monthly renewal charge (`1000` credits/month).
- Renewal reminder emails (`25`, `15`, `3` days before due date).
- Overdue final notice and auto-release (`30` days after due date if still unpaid).

## Key implementation files

- Billing worker: `supabase/functions/number-rental-billing/index.ts`
- Billing date/window helpers: `supabase/functions/_shared/number-rental-billing.ts`
- Purchase-time debit path: `app/routes/api.numbers.tsx`
- Node test updates (purchase path): `test/numbers.route.test.ts`
- Deno tests (date/window logic): `supabase/functions/__tests__/number_rental_billing_test.ts`
- Cron registration migration: `supabase/migrations/202604140001_number_rental_billing_cron.sql`

## Billing rules

- **Rollout start:** applies only to rented numbers with `workspace_number.created_at >= 2026-04-01` (UTC day).
- **Monthly amount:** `1000` credits per rented number.
- **Anchor date:** `workspace_number.created_at`.
- **Due date per month:** same day-of-month as anchor, with month-end fallback.
  - Example: anchor on Jan 31 -> Feb 28/29, Apr 30, etc.
- **Idempotent renewal charge key:** `number_rent:<workspaceNumberId>:<yyyy-mm>`.

## Purchase-time debit

When a number is rented via `POST /api/numbers`, we now write the initial debit with the shared idempotent helper:

- `insertTransactionHistoryIdempotent(...)`
- key: `number_rent_purchase:<workspace_id>:<twilio_number_sid>`

This prevents duplicate initial charges during retries.

## Daily renewal worker flow

The `number-rental-billing` edge function performs a daily sweep:

1. Load all rented numbers.
2. Skip numbers created before `2026-04-01`.
3. Resolve current month due date from anchor (`created_at`).
4. If today is due date:
   - If workspace has enough credits, insert monthly debit idempotently.
   - If not enough credits, leave unpaid for grace handling.
5. Evaluate reminder windows for current/previous cycle and send notices once.
6. On `+30` days after due date for an unpaid cycle:
   - send final notice,
   - release Twilio number,
   - delete `workspace_number` row.

## Reminder emails

Emails are sent via Resend to workspace users with role `owner` or `admin`:

- `-25 days`
- `-15 days`
- `-3 days`
- `+30 days` (final notice before/at release)

Email dedupe is tracked in number capabilities:

- `workspace_number.capabilities.rental_billing.notifications`
- key format: `<cycleKey>:<windowKey>` (for example `2026-04:pre15`)

## Grace period and release

- Grace period is `30` days from due date for unpaid renewals.
- On day `+30`, if cycle is still unpaid:
  - Twilio incoming number is removed from the workspace subaccount.
  - `workspace_number` record is deleted.

Manual removal before day `+30` is naturally treated as a no-op by future runs because the row no longer exists.

## Scheduler

Migration `202604140001_number_rental_billing_cron.sql` registers a daily cron job:

- job name: `number_rental_billing_daily`
- schedule: `15 3 * * *` (UTC)

It uses `public.create_cron_job(...)` with `net.http_post(...)` to call the edge function URL.

The migration expects one of these DB settings to be present:

- `app.settings.edge_functions_base_url`, or
- `app.settings.supabase_functions_url`

If neither setting is present, migration exits with a notice and does not create the job.

## Verification and tests

- Node route tests:
  - `npm run test:node -- test/numbers.route.test.ts`
- Deno function tests:
  - `npx deno test --allow-env --allow-read --allow-net supabase/functions/__tests__/number_rental_billing_test.ts supabase/functions/__tests__/import_all_test.ts`

Date logic tests cover:

- 31st day fallback behavior,
- leap/non-leap February handling,
- notification windows (`-25/-15/-3/+30`).
