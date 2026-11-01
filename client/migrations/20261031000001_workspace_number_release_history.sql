-- Retain the original number row after release. Existing rows remain active.
-- Old release receipts are read separately for history; do not inject released
-- rows while an earlier app version can still list all workspace_number rows.
alter table public.workspace_number
  add column if not exists status text not null default 'active',
  add column if not exists released_at timestamptz;

alter table public.workspace_number
  drop constraint if exists workspace_number_release_status_check;
alter table public.workspace_number
  add constraint workspace_number_release_status_check check (
    (status = 'active' and released_at is null)
    or (status = 'released' and released_at is not null)
  );

-- A later, explicit purchase creates a new row; it never reactivates history.
alter table public.workspace_number
  drop constraint if exists unique_workspace_phone_number;
create unique index if not exists unique_workspace_phone_number_active
  on public.workspace_number (workspace, phone_number)
  where status = 'active';

comment on column public.workspace_number.status is
  'Number lifecycle, separate from rented/caller-id type. Only active rows may be used or billed.';
comment on column public.workspace_number.released_at is
  'Final release completion time. Released rows are read-only workspace history.';

-- Refuse delayed settings/billing writers as well as attempts to re-rent a row.
-- Returning no row gives callers the same result as an unavailable number.
create or replace function public.keep_released_workspace_number_read_only()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  -- FK actions also run this trigger. Allow only their reference-column changes;
  -- status, release date and all other history data stay fixed, even when nested.
  -- https://www.postgresql.org/docs/17/sql-createtrigger.html
  if pg_trigger_depth() > 1
    and (to_jsonb(new) - array['workspace', 'inbound_script_id', 'inbound_queue_id'])
        is not distinct from
        (to_jsonb(old) - array['workspace', 'inbound_script_id', 'inbound_queue_id']) then
    return new;
  end if;
  return null;
end;
$$;
drop trigger if exists workspace_number_released_read_only on public.workspace_number;
create trigger workspace_number_released_read_only
  before update on public.workspace_number
  for each row when (old.status = 'released')
  execute function public.keep_released_workspace_number_read_only();
