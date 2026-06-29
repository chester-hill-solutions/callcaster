# Migration ledger audit (Phase 0)

Read-only inventory of `supabase/migrations/` and how it relates to hosted Supabase vs Railway review Postgres.

**Cutover rule (locked):** No new migrations on hosted Supabase prod during staging build. Hotfixes are code-only until big-bang. Schema cleanup runs on Railway review/staging first.

## Ledger format

Supabase CLI records applied migrations in `supabase_migrations.schema_migrations` (version = **numeric prefix before `_`** in the filename, e.g. `20260628130500` or `202604140001`).

## In-repo migrations (34 files)

| Version prefix | File | Kind | Notes |
|---|---|---|---|
| `202403010000` | `20240301000000_add_chunked_export_functions.sql` | DDL/functions | Chunked export RPCs |
| `202403200000` | `20240320000000_add_phone_verification.sql` | DDL | **Drop target** — PIN flow removed; keep `verification_session` |
| `202406010000` | `20240601000000_remote_history_parity.sql` | Parity | `select 1` — history only |
| `202407010000` | `20240701000000_remote_history_parity.sql` | Parity | `select 1` — history only |
| `202502100000` | `20250210000000_create_workspace_api_key.sql` | DDL | Keep |
| `202508070000` | `20250807000000_drop_unused_columns.sql` | DDL | Partially superseded by ADR-0015 cleanup |
| `202603110000` | `20260311000000_create_verification_session.sql` | DDL | Keep (call-in caller ID) |
| `202603120000` | `20260312000000_create_handset_session.sql` | DDL | Keep |
| `202603132200` | `20260313220000_find_contacts_by_phones.sql` | RPC | Port to app/Drizzle or keep as SQL function |
| `202603142000` | `20260314200000_contact_conversation_indexes.sql` | DDL | Keep indexes in baseline |
| `202603142130` | `20260314213000_idempotency_and_queue_reservations.sql` | DDL | Keep |
| `202604140001` | `202604140001_number_rental_billing_cron.sql` | Cron | **Replace** with Railway worker before gate |
| `202604141200` | `20260414120000_campaign_sms_send_mode.sql` | DDL | Keep |
| `202604142000` | `20260414200000_twilio_open_sync_cron.sql` | Cron | **Replace** with Railway worker |
| `202604151200` | `20260415120000_add_dequeue_fields.sql` | DDL | Dequeue metadata on `campaign_queue` |
| `202604151400` | `20260415140000_restore_campaign_dial_ratio.sql` | DDL | Reconcile with unified `campaign` table |
| `202604161400` | `20260416140000_twilio_open_sync_ensure_cron_job_fn.sql` | Cron fn | **Replace** with worker |
| `202605211400` | `20260521140000_queue_state_and_claim.sql` | DDL/RPC | Keep `queue_state`; drop legacy `status` in transform |
| `202605271800` | `20260527180000_campaign_queue_throughput.sql` | DDL/RPC | Keep policy in baseline |
| `202605281400` | `20260528140000_campaign_queue_policy_cleanup.sql` | DDL | Keep constants aligned with TS |
| `202606100001` | `202606100001_billing_reconciliation_and_credits_trigger.sql` | Trigger | **Dropped** by `20260628120000` |
| `202606101945` | `20260610194500_number_rental_cron_secret_header.sql` | Cron patch | Worker replaces |
| `202606101950` | `20260610195000_billing_reconcile_cron_concurrency.sql` | Cron patch | Worker replaces |
| `202606102000` | `20260610200000_workspace_number_inbound_ring_count.sql` | DDL | Keep |
| `202606102100` | `20260610210000_agent_status.sql` | DDL | Keep — SSE presence path |
| `202606102150` | `20260610215000_inbound_queue_routing.sql` | DDL | Keep |
| `202606102170` | `20260610217000_inbound_ivr.sql` | DDL | Keep |
| `202606281200` | `20260628120000_apply_ledger_entry_and_sync_credits.sql` | RPC | Keep — canonical billing |
| `202606281300` | `20260628130000_adr_0019_support_level.sql` | DDL | Keep |
| `202606281301` | `20260628130100_adr_0020_campaign_phase.sql` | DDL | Keep |
| `202606281302` | `20260628130200_adr_0021_households.sql` | DDL | Extend with `household_key` transform |
| `202606281303` | `20260628130300_adr_0022_typed_results.sql` | DDL | Keep |
| `202606281304` | `20260628130400_adr_0023_voter_list_lifecycle.sql` | DDL | Keep |
| `202606281305` | `20260628130500_adr_0004_drop_phone_verification_rls.sql` | DDL | Last RLS drop |

## Parity-only migrations

These exist only so hosted DB history matches git; no schema change:

- `20240601000000_remote_history_parity.sql`
- `20240701000000_remote_history_parity.sql`

They should **not** appear in the squashed `drizzle/0000_baseline.sql`.

## Post-transform archive plan

After Railway schema cleanup and squashed baseline:

1. Move `supabase/migrations/*.sql` → `docs/archive/supabase-migrations/`
2. Forward DDL only via `drizzle-kit generate` → `drizzle/`
3. Retire `supabase db push` for app schema (Edge Functions config may remain until Bun cutover)

## Verification commands

```bash
# Local / CI: list in-repo migration files
ls -1 supabase/migrations/*.sql | wc -l   # expect 34

# Against a DATABASE_URL (Railway review or read-only prod replica):
npm run db:ledger:check
```

### Expected ledger query

```sql
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Hosted prod and Railway review should both show **34 rows** if the restored dump is current. Any mismatch blocks Phase 1 transform.

## Gaps vs target schema (Phase 1 transform)

Not represented as standalone migrations — applied in Railway-only transform SQL before baseline squash:

| Area | Action |
|---|---|
| Campaign tables | Merge `live_campaign`, `ivr_campaign`, `message_campaign` → `campaign` + type |
| `campaign_queue` | Drop `status`; canonical `queue_state`, `assigned_to_user_id`, `provider_status` |
| `call` / `message` | ADR-0015: domain `id` PK, `twilio_sid`, drop Twilio noise columns |
| `contact` | Drop `fullname`, `carrier`, `address_id`; add/use `household_key` |
| `workspace` | Split `twilio_data` → typed tables |
| Vestigial tables | Drop `email*`, `audience_rule`, `campaign_schedule_jobs`, `twilio_cancellation_queue`, `workspace_permissions`, `phone_verification` |
| RCS onboarding | Remove code + columns |
| `user.activity`, `workspace.users` | Drop when SSE + `agent_status` wired |

## References

- Canonical plan: [`supabase-postgres-migration-plan.md`](./supabase-postgres-migration-plan.md)
- Execution tracker: [`migration-orchestration.md`](./migration-orchestration.md)
- ADR-0008 (needs revision): [`adr/0008-clean-rebuild-and-cutover.md`](./adr/0008-clean-rebuild-and-cutover.md)
