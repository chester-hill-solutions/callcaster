# Railway review environment (migration target)

All Phase 1 schema transform, squashed baseline, Phase 2 Drizzle port, and Phase 3 staging stack work runs against this environment until prod big-bang.

## Dashboard

[CallCaster → visual-asset-review](https://railway.com/project/32b36c6c-5f3d-463b-8c7f-bbcd70351e8f?environmentId=18ef9173-4b33-4a62-9b94-9dfc7a36eb05)

## IDs

| Resource | Name | ID |
|----------|------|-----|
| Project | CallCaster | `32b36c6c-5f3d-463b-8c7f-bbcd70351e8f` |
| Environment | **visual-asset-review** | `18ef9173-4b33-4a62-9b94-9dfc7a36eb05` |
| App service | callcaster-review | `d7a21d02-a448-4970-9989-ab2a7a2589ee` |
| Postgres (canonical) | PostgreSQL 18 | `d0e9937d-5e12-4625-9322-178378aa8999` |

Other Postgres services in the project (`Postgres-17`, `Postgres-nhgx`, etc.) are legacy — do not use for migration work unless explicitly repointed.

## CLI context

```bash
railway link --project 32b36c6c-5f3d-463b-8c7f-bbcd70351e8f
railway environment visual-asset-review
railway service callcaster-review   # or PostgreSQL 18 for DB-only ops
railway status
```

## Database access

- **Inside Railway** (deploy, worker, `railway run`): use `DATABASE_URL` (internal host).
- **From local machine** (psql, `apply-all.sh`, ledger check): use `DATABASE_PUBLIC_URL` via `railway run`:

```bash
railway environment visual-asset-review
railway service "PostgreSQL 18"
railway run -- bash -lc 'psql "$DATABASE_PUBLIC_URL" -c "select count(*) from supabase_migrations.schema_migrations"'
```

Or export for local scripts:

```bash
railway run -- bash -lc 'echo "$DATABASE_PUBLIC_URL"'   # copy value locally; do not commit
DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:ledger:check
bash scripts/schema-transform/apply-all.sh              # review ONLY
```

## Migration workflow (this env)

**Transform progress (2026-06-29):** steps **00–05, 01c, 02/02b, 03/03a/03b, 08/08b** applied. **117k households** backfilled. **`drizzle/0000_baseline.sql`** generated (6951 lines). Pending sketches: **06, 07, 09**.

1. **Ledger check:** `npm run db:ledger:check` — **34/34 OK**
2. **Schema transform:** `scripts/schema-transform/apply-all.sh` — never on hosted Supabase prod.
3. **Verify:** `psql … -f scripts/schema-transform/10-verify.sql`
4. **Baseline:** `pg_dump --schema-only` → `drizzle/0000_baseline.sql`
5. **App:** point `callcaster-review` `DATABASE_URL` at `PostgreSQL 18`; run Phase 2–4 against review URL.

## Other environments (not migration target)

| Environment | ID | Use |
|-------------|-----|-----|
| production | `793b0ad1-0e4f-4bbe-a5a1-83e000123b92` | Big-bang cutover only (Phase 5) |
| stagin | `3dc12c7d-6fb1-45ae-bb5c-3317145dfa9f` | Legacy — do not use unless repointed |
| filterable-messages | `070a92a3-95a0-42a0-8f2e-f5bfaa6c9d95` | Unrelated experiment |

## References

- [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md)
- [`migration-delivery-board.md`](./migration-delivery-board.md)
- [`AGENTS.md`](../AGENTS.md) — Railway CLI conventions
