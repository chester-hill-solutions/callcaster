-- Workspace-scoped API keys for programmatic access (e.g. SMS API)
create table if not exists public.workspace_api_key (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint workspace_api_key_key_prefix_unique unique (key_prefix)
);

create index idx_workspace_api_key_prefix on public.workspace_api_key(key_prefix);

alter table public.workspace_api_key enable row level security;

create policy "Workspace members can manage API keys"
  on public.workspace_api_key for all
  using (
    exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = workspace_api_key.workspace_id
      and wu.user_id = auth.uid()
    )
  );
