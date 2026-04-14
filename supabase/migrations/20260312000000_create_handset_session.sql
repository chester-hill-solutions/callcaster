-- Handset sessions: one active per workspace; inbound calls dial to client_identity
create table if not exists public.handset_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  client_identity text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists handset_session_workspace_active_idx
  on public.handset_session(workspace_id, status)
  where status = 'active';

create index if not exists handset_session_expires_at_idx
  on public.handset_session(expires_at)
  where status = 'active';

alter table public.handset_session enable row level security;

create policy "Users can insert own handset sessions"
  on public.handset_session for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own handset sessions"
  on public.handset_session for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role can manage handset sessions"
  on public.handset_session for all
  to service_role
  using (true)
  with check (true);

-- Allow handset mode on workspace numbers; when true, voice URL should point to inbound-handset
alter table public.workspace_number
  add column if not exists handset_enabled boolean not null default false;
