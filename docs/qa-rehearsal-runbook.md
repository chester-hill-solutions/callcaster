# Rename the Railway QA environment (#1355)

Rename the existing Railway `staging` environment to `qa`. This is a name
change only. It must preserve the existing services, Postgres database, volume,
variables, domain, and `callcaster-staging` bucket.

The QA environment continues to deploy `master`. It is not a branch.

## Before the Railway rename

1. Configure the existing GitHub Actions `qa` environment:
   - secrets: `RAILWAY_TOKEN`, `DATABASE_URL`
   - variables: `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`
2. Set `RAILWAY_ENVIRONMENT_ID` to the existing environment ID:
   `3dc12c7d-6fb1-45ae-bb5c-3317145dfa9f`.
3. Keep the `staging` GitHub environment until the QA drift workflow succeeds.

## Rename and verify

1. In the Railway dashboard, rename the existing `staging` environment to
   `qa`. Do not create another environment.
2. Verify the environment ID is unchanged and the following resources remain
   attached:
   - `CallCaster`
   - `callcaster-worker`
   - `Postgres-mgzk` and its volume
   - `callcaster-staging` bucket
3. Verify the service domain. If Railway changes it, update the app's
   `BASE_URL` and `BETTER_AUTH_URL` references before redeploying.
4. From a worktree with the QA source model, run a read-only plan:

   ```bash
   railway environment qa
   railway config plan --file .railway/railway.ts --detailed-exit-code --json
   ```

   Review the result. A rename must not recreate or delete infrastructure.
   Do not apply a destructive plan.

5. Merge the source rename. The Railway GitHub workflow only runs plans; it
   does not apply infrastructure changes.
6. Dispatch the `qa` ledger-drift workflow. It must complete both database
   checks with the existing QA database.
7. If the app or worker is redeployed, verify `/readyz`, database access, and
   the `env:qa` TwiML App before removing `env:staging`.

## Rollback

Rename the same Railway environment back to `staging`, restore the GitHub
workflow environment mapping, and keep the resource IDs unchanged. Do not
clone a database or recreate a bucket as part of rollback.
