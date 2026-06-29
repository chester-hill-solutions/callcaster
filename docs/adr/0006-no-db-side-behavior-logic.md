# No DB-side behavior logic; Postgres is storage + concurrency only

No table triggers, no behavior logic in the DB. The one existing trigger (`transaction_history_update_credits`) is replaced by the `apply_ledger_entry_and_sync_credits` plpgsql RPC: atomic idempotent ledger insert (`INSERT ... ON CONFLICT DO NOTHING` with `xmax = 0` inserted check) + `UPDATE workspace SET credits = credits + amount` in a single transaction. This is a concurrency RPC (allowed by ADR-0003), not a trigger. App-layer `insertTransactionHistoryIdempotent` and Edge Function billing paths call this RPC. NOTIFY is a signal primitive, not behavior — allowed from app code in the same transaction as a data write. The `workspace.twilio_data` JSONB blob (which held `portalConfig`, `portalSync`, `onboarding`, `billingReconciliationSnapshot` with hand-rolled read-modify-write and no optimistic locking) is normalized to typed tables: `workspace_twilio_config`, `workspace_onboarding`, `workspace_sync_snapshot`.

## Considered Options

- **Keep the one trigger as an exception** — erodes the ban posture; "why is this one here?"
- **Derived credits via SUM on read** — expensive for every API-key auth + billing page load.

## References

- `supabase/migrations/20260628120000_apply_ledger_entry_and_sync_credits.sql` (the RPC replacing the trigger)
- `supabase/migrations/202606100001_billing_reconciliation_and_credits_trigger.sql:17` (the banned trigger, now dropped)
- `app/lib/transaction-history.server.ts` (`insertTransactionHistoryIdempotent` calls the RPC)
- `supabase/functions/_shared/ivr-status-logic.ts` (Edge Function `insertTransactionHistoryIdempotent` calls the RPC)
- `app/lib/merge-workspace-twilio-data.server.ts` (read-modify-write on JSONB — concurrency risk being eliminated)
