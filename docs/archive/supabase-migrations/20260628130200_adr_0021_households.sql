-- ADR-0021: Household as a first-class domain entity.
-- Promotes the de-facto `contact.address_id` household key into a real table
-- with `do_not_knock` / `last_contacted_at`, and gives `contact` an FK.

do $$ begin
  create table if not exists public.households (
    id uuid primary key default gen_random_uuid(),
    household_key text not null,
    workspace_id uuid references public.workspace(id) on delete cascade,
    address text,
    city text,
    province text,
    postal text,
    do_not_knock boolean not null default false,
    last_contacted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when duplicate_table then null;
end $$;

create index if not exists households_workspace_key_idx
  on public.households (workspace_id, household_key);

create unique index if not exists households_workspace_key_uniq
  on public.households (workspace_id, household_key);

alter table public.contact
  add column if not exists household_id uuid;

alter table public.contact
  drop constraint if exists contact_household_id_fkey;

alter table public.contact
  add constraint contact_household_id_fkey
  foreign key (household_id)
  references public.households(id) on delete set null;

create index if not exists contact_household_id_idx
  on public.contact (household_id)
  where household_id is not null;

-- Backfill households from the existing `address_id` household proxy.
-- One household row per (workspace, household_key); `household_key` is the
-- deterministic `address_id` (falling back to `address`) so historical
-- householding keeps working.
insert into public.households (household_key, workspace_id, address, city, province, postal)
select
  distinct on (c.workspace, coalesce(c.address_id, c.address))
  coalesce(c.address_id, c.address) as household_key,
  nullif(c.workspace, '')::uuid as workspace_id,
  c.address,
  c.city,
  c.province,
  c.postal
from public.contact c
where coalesce(c.address_id, c.address) is not null
order by c.workspace, coalesce(c.address_id, c.address)
on conflict (workspace_id, household_key) do nothing;

-- Link contacts to the household rows by deterministic key.
update public.contact c
set household_id = h.id
from public.households h
where c.household_id is null
  and h.household_key is not null
  and h.household_key = coalesce(c.address_id, c.address)
  and (h.workspace_id is null or h.workspace_id = nullif(c.workspace, '')::uuid);

-- ---------------------------------------------------------------------------
-- ADR-0021: switch dequeue_contact / dequeue_household to join via
-- household_id, keeping address_id as a backward-compat fallback for rows
-- that predate the backfill.
-- ---------------------------------------------------------------------------

create or replace function public.dequeue_contact(
  passed_contact_id integer,
  group_on_household boolean,
  dequeued_by_id uuid default null,
  dequeued_reason_text text default null
)
returns void
language plpgsql
as $function$
begin
  update public.campaign_queue
  set
    status = 'dequeued',
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id;

  if group_on_household then
    -- Primary path: join via the new household_id FK.
    update public.campaign_queue cq
    set
      status = 'dequeued',
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2
      on c1.household_id is not null
      and c1.household_id = c2.household_id
    where
      c1.id = passed_contact_id
      and cq.contact_id = c2.id
      and cq.status = 'queued';

    -- Backward-compat fallback: rows still missing household_id fall back to
    -- the legacy address_id join so no historical contact is left queued.
    update public.campaign_queue cq
    set
      status = 'dequeued',
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2
      on c1.household_id is null
      and c1.address_id is not null
      and c1.address_id = c2.address_id
      and c2.household_id is null
    where
      c1.id = passed_contact_id
      and cq.contact_id = c2.id
      and cq.status = 'queued';
  end if;
end;
$function$;

create or replace function public.dequeue_household(
  contact_id_variable integer,
  dequeued_by_id uuid default null,
  dequeued_reason_text text default null
)
returns void
language plpgsql
as $function$
begin
  -- Primary path: join via household_id.
  update public.campaign_queue cq
  set
    status = 'dequeued',
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  from public.contact c1
  join public.contact c2
    on c1.household_id is not null
    and c1.household_id = c2.household_id
  where
    c1.id = contact_id_variable
    and cq.contact_id = c2.id
    and cq.status = 'queued';

  -- Backward-compat fallback: address_id join for un-migrated rows.
  update public.campaign_queue cq
  set
    status = 'dequeued',
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  from public.contact c1
  join public.contact c2
    on c1.household_id is null
    and c1.address_id is not null
    and c1.address_id = c2.address_id
    and c2.household_id is null
  where
    c1.id = contact_id_variable
    and cq.contact_id = c2.id
    and cq.status = 'queued';
end;
$function$;
