-- Use the existing intent timestamp for fresh queue births too. Historical
-- nulls remain unknown: a transaction-start created_at cannot prove ownership
-- of a legacy Call without a saved queue ID or of its household siblings.
alter table public.campaign_queue
  alter column redial_requested_at set default clock_timestamp();
