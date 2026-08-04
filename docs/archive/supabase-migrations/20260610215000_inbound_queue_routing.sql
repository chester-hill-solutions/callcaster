-- Inbound queue routing for contact center ACD
-- Each workspace can create queues, assign agents, and route inbound calls

-- Queue entry state machine: queued → offered → accepted → completed
--                                    → declined    → timed_out
--                        → abandoned (caller hung up in queue)
do $$ begin
  create type public.queue_entry_state as enum ('queued', 'offered', 'accepted', 'declined', 'timed_out', 'abandoned', 'completed');
exception
  when duplicate_object then null;
end $$;

-- Inbound queue: a workspace-level queue for routing calls to agents
create table if not exists public.inbound_queue (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  name text not null,
  description text,
  hold_audio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_queue_workspace_idx
  on public.inbound_queue(workspace_id);

alter table public.inbound_queue enable row level security;

drop policy if exists "Members can read inbound_queue" on public.inbound_queue;
drop policy if exists "Admins can manage inbound_queue" on public.inbound_queue;

create policy "Members can read inbound_queue"
  on public.inbound_queue for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid()
    )
  );

create policy "Admins can manage inbound_queue"
  on public.inbound_queue for insert
  to authenticated
  with check (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can update inbound_queue"
  on public.inbound_queue for update
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can delete inbound_queue"
  on public.inbound_queue for delete
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Service role can manage inbound_queue"
  on public.inbound_queue for all
  to service_role
  using (true)
  with check (true);

-- Queue membership: which agents can receive calls from this queue
create table if not exists public.inbound_queue_member (
  id bigint generated always as identity primary key,
  queue_id bigint not null references public.inbound_queue(id) on delete cascade,
  user_id uuid not null references public.user(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (queue_id, user_id)
);

create index if not exists inbound_queue_member_queue_idx
  on public.inbound_queue_member(queue_id);

create index if not exists inbound_queue_member_user_idx
  on public.inbound_queue_member(user_id);

alter table public.inbound_queue_member enable row level security;

drop policy if exists "Members can read inbound_queue_member" on public.inbound_queue_member;
drop policy if exists "Admins can manage inbound_queue_member" on public.inbound_queue_member;
drop policy if exists "Service role can manage inbound_queue_member" on public.inbound_queue_member;

create policy "Members can read inbound_queue_member"
  on public.inbound_queue_member for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid()
    )
  );

create policy "Admins can manage inbound_queue_member"
  on public.inbound_queue_member for insert
  to authenticated
  with check (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can delete inbound_queue_member"
  on public.inbound_queue_member for delete
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Service role can manage inbound_queue_member"
  on public.inbound_queue_member for all
  to service_role
  using (true)
  with check (true);

-- Queue entry: a single caller waiting in or processed by a queue
create table if not exists public.inbound_queue_entry (
  id bigint generated always as identity primary key,
  queue_id bigint not null references public.inbound_queue(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  call_sid text,
  caller_number text,
  status public.queue_entry_state not null default 'queued',
  offered_to_user_id uuid references public.user(id) on delete set null,
  offered_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  twilio_queue_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inbound_queue_entry_queue_status_idx
  on public.inbound_queue_entry(queue_id, status)
  where status in ('queued', 'offered');

create index if not exists inbound_queue_entry_workspace_idx
  on public.inbound_queue_entry(workspace_id);

alter table public.inbound_queue_entry enable row level security;

drop policy if exists "Members can read inbound_queue_entry" on public.inbound_queue_entry;
drop policy if exists "Service role can manage inbound_queue_entry" on public.inbound_queue_entry;

create policy "Members can read inbound_queue_entry"
  on public.inbound_queue_entry for select
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.workspace_users
      where user_id = auth.uid()
    )
  );

create policy "Service role can manage inbound_queue_entry"
  on public.inbound_queue_entry for all
  to service_role
  using (true)
  with check (true);

-- Add inbound_queue_id to workspace_number for opt-in per number
alter table public.workspace_number
  add column if not exists inbound_queue_id bigint
  references public.inbound_queue(id) on delete set null;

create index if not exists workspace_number_inbound_queue_idx
  on public.workspace_number(inbound_queue_id)
  where inbound_queue_id is not null;

-- RPC: Claim an available agent for an inbound queue entry
-- Atomically finds an available agent, creates the entry, and claims the agent
create or replace function public.claim_inbound_queue_entry(
  p_queue_id bigint,
  p_workspace_id uuid,
  p_call_sid text,
  p_caller_number text
) returns table(agent_user_id uuid, entry_id bigint)
language plpgsql
as $$
declare
  v_agent record;
  v_entry_id bigint;
  v_now timestamptz := now();
begin
  select as2.user_id, as2.workspace_id
  into v_agent
  from public.agent_status as2
  join public.inbound_queue_member iqm
    on iqm.user_id = as2.user_id and iqm.queue_id = p_queue_id
  where as2.workspace_id = p_workspace_id
    and as2.status = 'available'
    and as2.current_queue_entry_id is null
    and as2.last_heartbeat_at > v_now - interval '2 minutes'
  limit 1
  for update of as2 skip locked;

  if not found then
    return;
  end if;

  insert into public.inbound_queue_entry
    (queue_id, workspace_id, call_sid, caller_number, status, offered_to_user_id, offered_at)
  values
    (p_queue_id, p_workspace_id, p_call_sid, p_caller_number, 'offered', v_agent.user_id, v_now)
  returning id into v_entry_id;

  update public.agent_status
  set status = 'busy',
      current_queue_entry_id = v_entry_id,
      status_reason = 'inbound_offer',
      status_started_at = v_now,
      updated_at = v_now
  where workspace_id = v_agent.workspace_id
    and user_id = v_agent.user_id;

  insert into public.agent_status_event
    (workspace_id, user_id, from_status, to_status, reason, created_at)
  values
    (p_workspace_id, v_agent.user_id, 'available', 'busy', 'inbound_offer', v_now);

  return query select v_agent.user_id, v_entry_id;
end;
$$;

-- RPC: Release an agent from an inbound offer (no answer / declined)
create or replace function public.release_inbound_offer(
  p_entry_id bigint,
  p_outcome text default 'timed_out'
)
returns void
language plpgsql
as $$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and status = 'offered';

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = p_outcome::public.queue_entry_state,
      updated_at = v_now,
      completed_at = v_now
  where id = p_entry_id;

  if v_entry.offered_to_user_id is not null then
    update public.agent_status
    set status = 'available',
        current_queue_entry_id = null,
        status_reason = 'offer_' || p_outcome,
        updated_at = v_now
    where workspace_id = v_entry.workspace_id
      and user_id = v_entry.offered_to_user_id;

    insert into public.agent_status_event
      (workspace_id, user_id, from_status, to_status, reason, created_at)
    values
      (v_entry.workspace_id, v_entry.offered_to_user_id, 'busy', 'available', 'offer_' || p_outcome, v_now);
  end if;
end;
$$;

-- RPC: Complete an inbound queue entry (call completed)
create or replace function public.complete_inbound_queue_entry(
  p_entry_id bigint
)
returns void
language plpgsql
as $$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and status in ('offered', 'accepted');

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = 'completed',
      updated_at = v_now,
      completed_at = v_now
  where id = p_entry_id;

  if v_entry.offered_to_user_id is not null then
    update public.agent_status
    set status = 'wrap_up',
        current_queue_entry_id = null,
        status_reason = 'inbound_call_completed',
        updated_at = v_now
    where workspace_id = v_entry.workspace_id
      and user_id = v_entry.offered_to_user_id;
  end if;
end;
$$;

-- RPC: Mark entry as abandoned (caller hung up in queue)
create or replace function public.abandon_inbound_queue_entry(
  p_entry_id bigint
)
returns void
language plpgsql
as $$
begin
  update public.inbound_queue_entry
  set status = 'abandoned',
      updated_at = now(),
      abandoned_at = now()
  where id = p_entry_id and status = 'queued';
end;
$$;

-- RPC: Mark entry as accepted by agent, release stale agent_status lock
create or replace function public.accept_inbound_offer(
  p_entry_id bigint
)
returns void
language plpgsql
as $$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and status = 'offered';

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  where id = p_entry_id;
end;
$$;

-- RPC: Queue controller — atomically claim the next waiting caller for agent retry
-- Used when acd-router needs to try the next caller after one declined
create or replace function public.next_inbound_queue_offer(
  p_queue_id bigint,
  p_agent_user_id uuid,
  p_workspace_id uuid
) returns table(call_sid text, entry_id bigint)
language plpgsql
as $$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select id, call_sid
  into v_entry
  from public.inbound_queue_entry
  where queue_id = p_queue_id
    and workspace_id = p_workspace_id
    and status = 'queued'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = 'offered',
      offered_to_user_id = p_agent_user_id,
      offered_at = v_now,
      updated_at = v_now
  where id = v_entry.id;

  update public.agent_status
  set current_queue_entry_id = v_entry.id,
      status = 'busy',
      status_reason = 'inbound_offer',
      updated_at = v_now
  where workspace_id = p_workspace_id
    and user_id = p_agent_user_id;

  return query select v_entry.call_sid, v_entry.id;
end;
$$;
