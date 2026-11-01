-- Legacy Calls can lack queue IDs. Their original outreach time must describe
-- insertion order, not the start of a transaction that can wait before writing.
-- Keep historical values; changing a default does not rewrite existing rows.
alter table public.campaign_queue
  alter column created_at set default clock_timestamp();
alter table public.outreach_attempt
  alter column created_at set default clock_timestamp();
