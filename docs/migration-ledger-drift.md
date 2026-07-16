# Migration ledger drift

A deployed database can be missing migrations that exist in `client/migrations/`
while the app runs happily on top of it. Nothing in CI catches this, because CI
has no deployed database to compare against.

This is not hypothetical. It has already caused a silent production-class
failure — see the worked example below.

## Why `npm run db:ledger:check` does not protect you by default

`scripts/db/check-migration-ledger.mjs` compares `client/migrations/*.sql`
against `AUTH_migrations.schema_migrations` — but **only when `DATABASE_URL` is
set**. `ci:local` runs it without one, so it prints the repo inventory and exits
0. That green line means "I listed some files", not "the ledger is in sync".

To make it gate something, point it at a database and require one:

```
DATABASE_URL=<target> node scripts/db/check-migration-ledger.mjs --require-db
```

`--require-db` (or `LEDGER_CHECK_REQUIRE_DB=1`) turns a missing `DATABASE_URL`
into a failure, so a misconfigured pipeline fails loudly instead of passing
vacuously. Run this against each environment **after** applying migrations and
**before** the app redeploys.

## Worked example: credit purchases fail with "could not confirm this payment"

Symptom: Stripe checkout completes, the user is redirected to
`/billing?payment_status=error`, the balance stays at 0, and the page tells them
to contact support.

Server log:

```
PostgresError: column "type" is of type transaction_type but expression is of type text
where: PL/pgSQL function apply_ledger_entry_and_sync_credits(...) line 5
code: 42804
```

Cause: the database was running the **original**
`20260704000004_apply_ledger_entry_and_sync_credits`, which inserts the `text`
parameter `p_type` straight into the `transaction_type` enum column. Two later
migrations add the required `p_type::public.transaction_type` cast:

- `20260710020000_fix_apply_ledger_entry_enum_cast.sql`
- `20260711000000_money_columns_integer_and_ledger_hardening.sql`

Neither had been applied. The app code was correct throughout.

Diagnosing this from the function signature alone is misleading: the original
migration already declared `p_amount integer`, so the signature looks current.
The distinguishing evidence is the uncast `p_type` in the error's
`internal_query`.

### Why nothing else caught it

Credit purchases have two independent, idempotent paths — the post-checkout
redirect (`confirmStripeCheckoutSessionForRedirect`) and the Stripe webhook —
both keyed on `stripeSessionKey(session.id)`. Either can complete a purchase.
But on an environment where the webhook is not registered with Stripe (typical
for ephemeral review deployments), the redirect is the *only* credit path, so
its failure is total and silent apart from the user-facing error.

Both paths call `apply_ledger_entry_and_sync_credits`, so a stale ledger
function breaks both anyway. There is no fallback for schema drift.

## Checklist when credits or money behave strangely

1. Run the ledger check against that environment with `--require-db`.
2. Apply any missing migrations, then re-run it.
3. Confirm `apply_ledger_entry_and_sync_credits` casts `p_type` to
   `public.transaction_type`.
4. Check whether the Stripe webhook is registered for that deployment. If not,
   the redirect path is load-bearing on its own.

## Related

- `20260711000000_money_columns_integer_and_ledger_hardening.sql` also converts
  the money columns from `numeric` to `integer`. That matters beyond the ledger:
  postgres.js returns `numeric` as a **string**, and drizzle's `integer()` does
  no runtime re-parse, so `credits + delta` silently string-concatenates on a
  database that predates it.
- `npm run check:credit-writes` enforces that `workspace.credits` only changes
  via the ledger RPC. It guards the code path, not the deployed function.
