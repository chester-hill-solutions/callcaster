-- Agent state enum for contact-center presence tracking
do $$ begin
  create type public.agent_state as enum ('offline', 'available', 'busy', 'wrap_up', 'away');
exception
  when duplicate_object then null;
end $$;

-- Agent status: single source of truth for routing eligibility
create table if not exists public.agent_status (
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id uuid not null references public.user(id) on delete cascade,
  status public.agent_state not null default 'offline',
  status_reason text,
  status_started_at timestamptz not null default now(),
  current_queue_entry_id bigint,
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists agent_status_workspace_status_idx
  on public.agent_status(workspace_id, status)
  where status = 'available';

alter table public.agent_status enable row level security;

drop policy if exists "Agents can read own workspace agent_status" on public.agent_status;
drop policy if exists "Agents can insert own agent_status" on public.agent_status;
drop policy if exists "Agents can update own agent_status" on public.agent_status;
drop policy if exists "Service role can manage agent_status" on public.agent_status;

create policy "Agents can read own workspace agent_status"
  on public.agent_status for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid()
    )
  );

create policy "Agents can insert own agent_status"
  on public.agent_status for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Agents can update own agent_status"
  on public.agent_status for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role can manage agent_status"
  on public.agent_status for all
  to service_role
  using (true)
  with check (true);

-- Agent status event log (append-only, for shift tracking and audit)
create table if not exists public.agent_status_event (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id uuid not null references public.user(id) on delete cascade,
  from_status public.agent_state not null,
  to_status public.agent_state not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists agent_status_event_workspace_timing_idx
  on public.agent_status_event(workspace_id, created_at desc);

alter table public.agent_status_event enable row level security;

drop policy if exists "Agents can read own workspace events" on public.agent_status_event;
drop policy if exists "Agents can insert own events" on public.agent_status_event;
drop policy if exists "Service role can manage agent_status_event" on public.agent_status_event;

create policy "Agents can read own workspace events"
  on public.agent_status_event for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid()
    )
  );

create policy "Agents can insert own events"
  on public.agent_status_event for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Service role can manage agent_status_event"
  on public.agent_status_event for all
  to service_role
  using (true)
  with check (true);
