# Wave 0 — Migration Manifest

**Generated:** 2026-07-13

## Source authority

| Environment | Ledger | Evidence |
|-------------|--------|----------|
| Supabase production | `supabase_migrations.schema_migrations` | Customers live here; not queried this session |
| Railway review PG18 | `supabase_migrations.schema_migrations` (**38 rows**, queried 2026-07-13) | Legacy ledger; `AUTH_migrations` not on PG18 |
| CallCaster target (Drizzle) | `AUTH_migrations.schema_migrations` + `drizzle/*.sql` | Repo baseline + 6 forward migrations after `0000_baseline.sql` |

**Live DB compare:** Queried review PG18 via `railway run` on PostgreSQL 18 service (2026-07-13).

| Ledger | Review PG18 |
|--------|-------------|
| `supabase_migrations.schema_migrations` | **38 rows** (latest: `20260704000005`) |
| `AUTH_migrations.schema_migrations` | **Does not exist** — target Drizzle ledger not adopted on review yet |

### Review PG18 applied vs repo `client/migrations/`

| Version | In repo | On review PG18 |
|---------|---------|----------------|
| `20260704000000` | yes | **no** |
| `20260704000002` | yes | **no** |
| `20260704000003` | yes | **no** |
| `20260704000004` | yes | yes |
| `20260704000005` | yes | yes |
| `20260705000100` | yes | **no** |
| `20260705000200` (×3 files) | yes | **no** |
| `20260706120000` … `20260711130000` | yes | **no** |

**ARCH-01 forward repair:** Because `20260705000200` was never applied on review PG18, renumber two of the three duplicate files to fresh version prefixes before applying.

## In-repo migration inventory

### Drizzle forward chain

```
drizzle/0000_baseline.sql
drizzle/0001_auth_uid_shim.sql
drizzle/0002_workspace_events.sql
drizzle/0003_job.sql
drizzle/0004_better_auth.sql
drizzle/0005_two_factor.sql
drizzle/0006_app_schema_tail.sql
```

### Legacy `client/migrations/` (frozen post-cutover)

17 SQL files; checker inventories versions through `20260711130000`.

### ARCH-01 duplicate version

Three files share prefix **`20260705000200`**:

- `20260705000200_acd_duplicate_offer_guard.sql`
- `20260705000200_add_campaign_queue_workspace.sql`
- `20260705000200_survey_response_unique_result_id.sql`

`scripts/db/check-migration-ledger.mjs` grandfathers this version in `GRANDFATHERED_DUPLICATE_VERSIONS`. The Map collapses to one filename — **forward repair required** after inspecting deployed ledger on each environment.

## Canonical membership (cutover blocker)

| Artifact | Present? |
|----------|----------|
| `workspace_users` + enum | **Yes** — baseline |
| CHS `workspace_member` table | **No** |
| CHS `workspace_role` / `workspace_feature` tables | **No** |
| CHS invitation schema | **No** |
| Transform writing CHS structures | **No** — `09-drop-legacy-presence.sql` comments drop only |

## Import recommendation

1. Extend CHS auth-postgres schema + CallCaster Drizzle baseline in one atomic forward migration.
2. Update `scripts/schema-transform/` to emit canonical membership/invitation rows from Supabase export.
3. Preserve user UUIDs (SEC-08); map `field_director` → `admin`.
4. Rehearse clean install + full import on review PG18 before customer cutover.
5. Freeze `client/migrations` for new product schema; Drizzle-only forward path post-baseline adoption.

## pg_cron → Remix regression

`20260704000000_update_pg_cron_to_remix_routes.sql` repointed crons to Remix HTTP with `workspaceId: NULL`. Edge functions previously fanned out globally; Remix handlers require per-workspace input. **Coordinator pattern required (BILL-01).**
