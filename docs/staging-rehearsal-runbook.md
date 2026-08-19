# Staging rehearsal runbook (#1300 phase 2)

Converts the `staging` Railway environment from the Supabase-era
`hearty-expression` service to the v2 topology, populated with dev's
workspaces. This is the dress rehearsal for the production cutover
([#1303](https://github.com/chester-hill-solutions/callcaster/issues/1303)):
phase 3 repeats these steps against production, with `source("production")`
instead of `master` and live-mode Stripe keys instead of test-mode.

Decisions this encodes (see #1300):

- Staging is **not a branch** — it is a Railway environment mirroring
  production. During the rehearsal it deploys from `master` (v2); phase 3
  flips it to the `production` branch in the same change that promotes v2.
- **Supabase data is dropped, not migrated.** The system of record is dev's
  Postgres; its workspaces are cloned in (same schema lineage, plain
  dump/restore).
- Stripe stays **test-mode** in staging (dev's keys are already test-mode);
  Twilio is the shared account for now, so cloned workspace telephony config
  keeps working.

## Steps

All commands from the repo root, Railway CLI authenticated with account scope.

1. **Apply the staging topology** (destructive: deletes `hearty-expression`):

   ```bash
   railway environment staging
   railway config plan --file .railway/railway.ts
   # review: expect ~4 adds + 1 destructive delete (hearty-expression)
   railway config apply --file .railway/railway.ts --confirm-destructive
   railway environment dev
   ```

2. **Get the staging app URL.** The apply creates the `CallCaster` service
   instance in staging; give it a service domain (Railway dashboard → staging →
   CallCaster → Networking, or `railway domain`). Note the URL.

3. **Populate variables from dev** (Stripe test keys, shared Twilio, S3, etc.;
   `DATABASE_URL` becomes a reference to staging's own Postgres — never dev's):

   ```bash
   scripts/railway/sync-staging-vars.sh https://<staging-app-domain>
   ```

4. **Clone dev's workspaces** into staging's Postgres. Use the public
   `DATABASE_URL` from each environment's Postgres service (dev as source,
   staging as target):

   ```bash
   SOURCE_DATABASE_URL='<dev postgres url>' \
   TARGET_DATABASE_URL='<staging postgres url>' \
   CONFIRM_CLONE=yes scripts/db/clone-database.sh
   ```

5. **Deploy.** Redeploy both staging services (variables were set with
   `--skip-deploys`). Watch `/readyz` on the app.

6. **Validate the rehearsal** — the things this environment exists to catch:
   - sign-in with a cloned dev account (Better Auth against cloned data)
   - Twilio: place a campaign call / send an SMS from a cloned workspace
   - Stripe test-mode: buy credits end-to-end; confirm the ledger RPC applies
     the purchase (`apply_ledger_entry_and_sync_credits` — the review-env
     failure class from #1055)
   - worker: enqueue an audience upload and confirm it completes
   - `db:schema:check` / `check:db-rpcs` against staging's DATABASE_URL
     (two-lineage drift check)

7. **Record results on #1300** — anything that surprised us here becomes a
   playbook line item for production.

## Rollback

Staging has no consumers; rollback is re-running step 1's apply from a
reverted graph (restores `hearty-expression` from `master`, which still
carries v2 — i.e. there is no meaningful rollback target and none needed).

## Phase 3 deltas (production)

- `source("production")` (the promotion push and this flip happen together)
- live-mode Stripe keys + production webhook endpoint re-pointed
- Twilio webhooks/TwiML apps re-pointed at the production URL; enable webhook
  signature validation only after the host audit
- DNS stays (same Railway service keeps callcaster.ca)
- decommission Supabase + delete the two legacy `Postgres` services after
  soak, via a follow-up IaC change
