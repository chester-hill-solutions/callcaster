---
name: railway-iac
description: "Use when changing CallCaster Railway preservation lists or validating their read-only infrastructure plans."
---

# Railway preservation-list changes

Load `git`, `github-cli`, `github-issues`, and the Railway skill first.
Keep each change scoped to its issue. Do not apply a plan as part of a source
cleanup.

## Verify consumers before removing a variable

Read the current CallCaster project environments, service sources, active
deployment commits, and variable names and references. Complete pagination.
Search the exact active app and worker commits, not only the current checkout.
Check image-based services and configured commands too. Record the scope of the
check. Do not read or print secret values to check names or references.

## Compare read-only plans

Use an isolated worktree. Verify the installed CLI executable and version before
planning. The TypeScript SDK checks the executable in the child process's `_`
variable; point that variable at the same verified CLI executable that runs the
plan. An inherited shell value can point at an older CLI or another program.

Link that worktree with explicit project, environment, and service IDs. Resolve
the service in each environment; production's app can have a different ID from
the dev and staging app. Read back the link before proceeding.

Use the verified link for `railway config plan`. In the plan process, omit
process-level `RAILWAY_PROJECT_ID` and `RAILWAY_ENVIRONMENT_ID` overrides: an ID
override can omit the linked environment name required by `ctx.isEnvironment`.
Do not change the user's environment file or another checkout's link.

Capture a plan before and after the edit for each modeled environment. Require
the expected project and environment, successful evaluation, no diagnostics,
and no apply result. Accept exit 2 only as documented pending changes. Compare
the actual changes and retained required variables; do not treat a successful
command as proof that the plan is safe.

Never use `--show-values`, `--decrypt-variables`, or `config apply` for this check.
Run full `npm run ci:local` before pushing. Keep remote infrastructure-plan
checks visible and merge only on green.
