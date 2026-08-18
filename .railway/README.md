# Railway configuration

This project defines its Railway infrastructure in code.

```txt
.railway/railway.ts
```

Use this file to describe the Railway project you want: services, databases, buckets, replicas, groups, and environment variables. The root file selects a complete resource graph from `.railway/environments/` based on the target Railway environment.

## Common commands

Create the configuration files:

```bash
railway config init
```

Import an existing Railway project into code:

```bash
railway config pull
```

Preview what Railway would change:

```bash
railway config plan
```

Apply the planned changes:

```bash
railway config apply
```

## Notes

- `railway config plan` is safe and does not change Railway.
- `railway config apply` previews changes and asks before applying unless you pass `--yes`.
- Destructive changes in non-interactive or agent sessions require `railway config apply --confirm-destructive` after reviewing the plan.
- Services already managed by `railway.json` must be migrated before `.railway/railway.ts` can manage them.
- Use `replicas` for scaling; advanced placement can still specify region names.
- Use `group("Name", [resources])` to keep large projects organized on the Railway canvas.
- Secrets imported from Railway are rendered as `preserve()` so existing values are retained without writing secret values to source. Use `railway config pull --omit-preserved-variables` for a smaller import.
- Custom domains are managed separately with `railway domain`; the current CLI planner rejects custom-domain registration in IaC even though the SDK reference documents `domains`.
- The GitHub Actions workflow applies only after pushes to `dev` or `master`; pull requests run plan-only checks.

## GitHub Actions setup

Create GitHub Environments named `dev` and `production`. In each environment configure:

- Secret `RAILWAY_TOKEN`: a Railway project token for CallCaster.
- Variable `RAILWAY_PROJECT_ID`: `32b36c6c-5f3d-463b-8c7f-bbcd70351e8f`.
- Variable `RAILWAY_ENVIRONMENT_ID`: the matching Railway environment ID.

Protect the `production` GitHub Environment with required reviewers. The workflow plans pull requests and applies only pushes to the matching branch.
