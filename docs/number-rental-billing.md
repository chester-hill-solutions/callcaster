# Number Rental Billing

This document describes how monthly billing works for rented phone numbers (`workspace_number.type = "rented"`), including the monthly renewal charge and reminder emails. Grace-period auto-release is **not implemented** — see [Grace period and release](#grace-period-and-release).

## Scope

- Initial purchase charge when a number is rented.
- Monthly renewal charge (`100` credits/month at Option B / $2.00 CAD).
- Renewal reminder emails (`25`, `15`, `3` days before due date).
- **Not yet implemented:** overdue final notice and auto-release. See
  [Grace period and release](#grace-period-and-release) below — unpaid
  renewals currently require manual release.

## Key implementation files

The billing sweep runs as a React Router server route (the original Supabase
edge function has been retired as part of the Postgres/Drizzle migration):

- Billing sweep logic: `app/lib/number-rental-billing.server.ts`
- HTTP job route (called by pg_cron via `x-cron-secret`): `app/routes/api+/jobs+/number-rental-billing.action.server.ts`
- Purchase-time debit path: `app/routes/api+/numbers.action.server.ts`
- Node tests (purchase path): `test/numbers.route.test.ts`
- Node tests (sweep logic, reminders, result shape): `test/number-rental-billing.server.test.ts`
- Cron job target update (edge function -> React Router route): `client/migrations/20260704000000_update_pg_cron_to_remix_routes.sql`

## Billing rules

- **Rollout start:** applies only to rented numbers with `workspace_number.created_at >= 2026-04-01` (UTC day).
- **Monthly amount:** `100` credits per rented number (Option B).
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

`runNumberRentalBilling` (`app/lib/number-rental-billing.server.ts`), invoked
via the `number-rental-billing` job route, performs a daily sweep per
workspace:

1. Load all rented numbers.
2. Skip numbers created before `2026-04-01`.
3. Resolve current month due date from anchor (`created_at`).
4. If today is due date:
   - If workspace has enough credits, insert monthly debit idempotently.
   - If not enough credits, leave unpaid for grace handling (see
     [Grace period and release](#grace-period-and-release) — there is no
     automatic follow-up on an unpaid cycle yet).
5. Otherwise, if today falls in a reminder window (`-25`, `-15`, `-3` days
   before due date), send a reminder email.
6. Return sweep counters, including `remindersFailed` (emails that could not
   be sent, e.g. no owner/admin recipients or a Resend error) and
   `autoReleaseImplemented: false`.

## Reminder emails

Reminder emails are sent via Resend (`sendNumberRentalReminderEmail` in
`app/lib/number-rental-billing.server.ts`, following the same inline-Resend
pattern as `app/lib/low-credit-notify.server.ts`) to workspace owners/admins
(`listWorkspaceOwnerAdminEmails`):

- `-25 days`
- `-15 days`
- `-3 days`

A send only counts toward `remindersSent` if the email actually went out;
failures (Resend errors, or no owner/admin recipients found) are counted in
`remindersFailed` instead and logged, and do not throw — the sweep continues
to the next number.

There is currently no dedupe marker (no per-cycle "already sent" flag stored
on the number). A reminder window is only hit once per cycle under the
assumption the sweep runs once per day; running the sweep more than once on
the same day for the same workspace can re-send a reminder.

## Grace period and release

**Not implemented.** There is no automatic release of numbers with an unpaid
renewal cycle — `runNumberRentalBilling` always returns `released: 0` and
`autoReleaseImplemented: false`. An unpaid renewal is left as-is by the
sweep; someone must release the number manually (remove the Twilio incoming
number from the workspace subaccount and delete the `workspace_number` row)
until auto-release is built.

## Scheduler

A daily `pg_cron` job (`number_rental_billing_daily`, originally registered by
the now-archived `docs/archive/supabase-migrations/202604140001_number_rental_billing_cron.sql`)
calls the billing sweep once a day (`15 3 * * *` UTC). It was repointed from
the retired Supabase edge function to the React Router job route by
`client/migrations/20260704000000_update_pg_cron_to_remix_routes.sql`, which
calls `<base_url>/api/jobs/number-rental-billing` with an `x-cron-secret`
header matching the `CRON_SECRET` env var.

## Verification and tests

- Node route tests (purchase path):
  - `npm run test:node -- test/numbers.route.test.ts`
- Node tests (sweep logic — charge/reminder/result-shape behavior):
  - `npm run test:node -- test/number-rental-billing.server.test.ts`

Sweep logic tests cover:

- 31st day fallback behavior,
- leap/non-leap February handling,
- reminder windows (`-25/-15/-3` days) sending emails and incrementing `remindersSent`,
- failed sends incrementing `remindersFailed` instead of `remindersSent`,
- the honest result shape (`released: 0`, `autoReleaseImplemented: false`).
