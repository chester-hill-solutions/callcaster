create table if not exists public.audience_import_run (
  id uuid primary key default gen_random_uuid(),
  workspace uuid not null references public.workspace(id) on delete cascade,
  audience_id bigint not null references public.audience(id) on delete cascade,
  identity text not null,
  file_sha256 text not null,
  mapping jsonb not null,
  created_by uuid not null,
  imported_at timestamptz not null default now(),
  source_rows integer not null check (source_rows >= 0),
  next_index integer not null default 0,
  imported integer not null default 0 check (imported >= 0),
  invalid integer not null default 0 check (invalid >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  state text not null default 'processing' check (state in ('processing', 'completed')),
  unique (id, workspace, audience_id),
  unique (id, workspace),
  check (next_index between 0 and source_rows),
  check (next_index = imported + invalid + duplicates),
  check (state <> 'completed' or next_index = source_rows)
);
create unique index if not exists audience_import_identity
  on public.audience_import_run(workspace, audience_id, identity);
create table if not exists public.audience_import_row (
  run_id uuid not null,
  workspace uuid not null,
  record_number integer not null check (record_number > 0),
  source jsonb not null,
  outcome text not null check (outcome in ('imported', 'invalid', 'duplicate')),
  reason text,
  contact_id bigint,
  household_id uuid,
  warnings jsonb not null default '[]'::jsonb,
  primary key (run_id, record_number),
  foreign key (run_id, workspace) references public.audience_import_run(id, workspace) on delete cascade,
  check ((outcome = 'imported') = (contact_id is not null))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.audience_import_row'::regclass and conname = 'audience_import_row_workspace_fkey') then
    alter table public.audience_import_row add constraint audience_import_row_workspace_fkey
      foreign key (workspace) references public.workspace(id) on delete cascade;
  end if;
end $$;
alter table public.audience_upload add column if not exists import_run_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.audience_upload'::regclass and conname = 'audience_upload_import_run_tenant') then
    alter table public.audience_upload add constraint audience_upload_import_run_tenant
      foreign key (import_run_id, workspace, audience_id)
      references public.audience_import_run(id, workspace, audience_id);
  end if;
end $$;
create index if not exists audience_upload_import_run on public.audience_upload(import_run_id);
