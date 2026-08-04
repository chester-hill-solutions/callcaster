-- Billing page and reconciliation scan transaction_history per workspace ordered
-- by created_at; the only existing index is the partial idempotency-key unique
-- index, so those queries do a full seq scan + sort that degrades as the ledger grows.
CREATE INDEX IF NOT EXISTS transaction_history_workspace_created_idx
  ON public.transaction_history (workspace, created_at DESC);
