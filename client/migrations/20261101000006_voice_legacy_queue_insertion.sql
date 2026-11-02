-- Legacy completion needs insertion order, not an earlier transaction start.
alter table public.campaign_queue
  alter column created_at set default clock_timestamp();
alter table public.outreach_attempt
  alter column created_at set default clock_timestamp();

-- Do not infer historical insertion time. Add without a default first, so old
-- rows retain null; only future inserts get a trusted birth timestamp.
-- redial_requested_at remains reserved for explicit requeue and phone dedupe.
alter table public.campaign_queue add column inserted_at timestamptz;
alter table public.campaign_queue
  alter column inserted_at set default clock_timestamp();
