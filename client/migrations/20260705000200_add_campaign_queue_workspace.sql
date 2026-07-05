-- Add workspace tenancy column to campaign_queue (ADR-0004)

BEGIN;

-- 1. Add nullable workspace column
alter table public.campaign_queue
  add column if not exists workspace uuid;

-- 2. Backfill workspace from the parent campaign
update public.campaign_queue cq
  set workspace = c.workspace
from public.campaign c
where cq.campaign_id = c.id;

-- 3. Deduplicate rows before adding a unique constraint (keep the earliest id)
delete from public.campaign_queue
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by campaign_id, contact_id
        order by id asc
      ) as rn
    from public.campaign_queue
  ) ranked
  where rn > 1
);

-- 4. Enforce workspace is populated for every row
alter table public.campaign_queue
  alter column workspace set not null;

-- 5. Foreign key to workspace
alter table public.campaign_queue
  add constraint campaign_queue_workspace_fkey
  foreign key (workspace) references public.workspace(id)
  on update cascade on delete cascade;

-- 6. Unique constraint on campaign/contact
alter table public.campaign_queue
  add constraint campaign_queue_campaign_contact_unique
  unique (campaign_id, contact_id);

-- 7. Trigger to derive workspace from campaign when not provided
--     (covers RPC inserts such as handle_campaign_queue_entry)
create or replace function public.set_campaign_queue_workspace()
returns trigger
language plpgsql
as $$
begin
  if new.workspace is null or (tg_op = 'UPDATE' and new.campaign_id is distinct from old.campaign_id) then
    select workspace into new.workspace
    from public.campaign
    where id = new.campaign_id;
  end if;
  return new;
end;
$$;

-- Drop the trigger if it exists so this migration is idempotent
-- (create trigger itself is not "if not exists" in PG < 13 for event triggers; use drop)
drop trigger if exists campaign_queue_set_workspace on public.campaign_queue;

create trigger campaign_queue_set_workspace
  before insert or update on public.campaign_queue
  for each row
  execute function public.set_campaign_queue_workspace();

COMMIT;
