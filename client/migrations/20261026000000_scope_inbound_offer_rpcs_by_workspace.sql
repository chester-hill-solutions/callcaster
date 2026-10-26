-- Require the authenticated workspace at every inbound-offer mutation.
-- Removing the legacy overloads prevents a caller from bypassing that contract.
DROP FUNCTION IF EXISTS public.accept_inbound_offer(bigint);
DROP FUNCTION IF EXISTS public.release_inbound_offer(bigint, text);
DROP FUNCTION IF EXISTS public.abandon_inbound_queue_entry(bigint);
DROP FUNCTION IF EXISTS public.complete_inbound_queue_entry(bigint);

CREATE OR REPLACE FUNCTION public.accept_inbound_offer(p_entry_id bigint, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and workspace_id = p_workspace_id and status = 'offered'
  for update;

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  where id = p_entry_id and workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.release_inbound_offer(p_entry_id bigint, p_workspace_id uuid, p_outcome text DEFAULT 'timed_out'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and workspace_id = p_workspace_id and status = 'offered'
  for update;

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = p_outcome::public.queue_entry_state,
      updated_at = v_now,
      completed_at = v_now
  where id = p_entry_id and workspace_id = p_workspace_id;

  if v_entry.offered_to_user_id is not null then
    update public.agent_status
    set status = 'available',
        current_queue_entry_id = null,
        status_reason = 'offer_' || p_outcome,
        updated_at = v_now
    where workspace_id = p_workspace_id
      and user_id = v_entry.offered_to_user_id;

    insert into public.agent_status_event
      (workspace_id, user_id, from_status, to_status, reason, created_at)
    values
      (p_workspace_id, v_entry.offered_to_user_id, 'busy', 'available', 'offer_' || p_outcome, v_now);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.abandon_inbound_queue_entry(p_entry_id bigint, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.inbound_queue_entry
  set status = 'abandoned',
      updated_at = now(),
      abandoned_at = now()
  where id = p_entry_id and workspace_id = p_workspace_id and status = 'queued';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_inbound_queue_entry(p_entry_id bigint, p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_entry record;
  v_now timestamptz := now();
begin
  select * into v_entry
  from public.inbound_queue_entry
  where id = p_entry_id and workspace_id = p_workspace_id and status in ('offered', 'accepted')
  for update;

  if not found then
    return;
  end if;

  update public.inbound_queue_entry
  set status = 'completed',
      updated_at = v_now,
      completed_at = v_now
  where id = p_entry_id and workspace_id = p_workspace_id;

  if v_entry.offered_to_user_id is not null then
    update public.agent_status
    set status = 'wrap_up',
        current_queue_entry_id = null,
        status_reason = 'inbound_call_completed',
        updated_at = v_now
    where workspace_id = p_workspace_id
      and user_id = v_entry.offered_to_user_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_stale_inbound_offers(
    stale_after interval DEFAULT '2 minutes'
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    v_entry record;
    v_count integer := 0;
BEGIN
    FOR v_entry IN
        SELECT id, workspace_id
          FROM public.inbound_queue_entry
         WHERE status = 'offered'
           AND offered_at IS NOT NULL
           AND offered_at < now() - stale_after
         ORDER BY offered_at
         LIMIT 500
           FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM public.release_inbound_offer(v_entry.id, v_entry.workspace_id, 'timed_out');
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;
