-- Create the ACD (inbound call routing) functions in a migration.
--
-- These five RPCs are called from app/lib/acd/acd-router.server.ts and
-- app/lib/db-rpc.server.ts, but they were created by NO migration. They exist
-- only in docs/archive/supabase-migrations/20260610215000_inbound_queue_routing.sql,
-- which is archived and never applied.
--
-- The dev database has them because it descends from the Supabase era. Any
-- database built the supported way does not — including the fresh production
-- database, which was verified on 2026-07-31 to be missing all five. Inbound
-- call routing would have failed there on the first inbound call, with
-- `function next_inbound_queue_offer(...) does not exist`.
--
-- Definitions below are dumped from the dev database, i.e. the versions that
-- have actually been running, rather than re-derived from the archived file.

-- ── next_inbound_queue_offer ──
CREATE OR REPLACE FUNCTION public.next_inbound_queue_offer(p_queue_id bigint, p_agent_user_id uuid, p_workspace_id uuid)
 RETURNS TABLE(call_sid text, entry_id bigint)
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- ── accept_inbound_offer ──
CREATE OR REPLACE FUNCTION public.accept_inbound_offer(p_entry_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- ── release_inbound_offer ──
CREATE OR REPLACE FUNCTION public.release_inbound_offer(p_entry_id bigint, p_outcome text DEFAULT 'timed_out'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- ── abandon_inbound_queue_entry ──
CREATE OR REPLACE FUNCTION public.abandon_inbound_queue_entry(p_entry_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.inbound_queue_entry
  set status = 'abandoned',
      updated_at = now(),
      abandoned_at = now()
  where id = p_entry_id and status = 'queued';
end;
$function$
;

-- ── complete_inbound_queue_entry ──
CREATE OR REPLACE FUNCTION public.complete_inbound_queue_entry(p_entry_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- ── claim_inbound_queue_entry ──
CREATE OR REPLACE FUNCTION public.claim_inbound_queue_entry(p_queue_id bigint, p_workspace_id uuid, p_call_sid text, p_caller_number text)
 RETURNS TABLE(agent_user_id uuid, entry_id bigint)
 LANGUAGE plpgsql
AS $function$
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
$function$
;
