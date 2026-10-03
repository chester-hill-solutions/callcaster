BEGIN;

-- Supersedes the July 5 predicate: declined/timed_out are finished offers.
-- Reject pre-existing active duplicates instead of choosing which live call to end.
DROP INDEX IF EXISTS public.inbound_queue_entry_queue_call_sid_active_uidx;
CREATE UNIQUE INDEX inbound_queue_entry_queue_call_sid_active_uidx
  ON public.inbound_queue_entry (queue_id, call_sid)
  WHERE status IN ('queued', 'offered', 'accepted');

CREATE OR REPLACE FUNCTION public.claim_inbound_queue_entry(
  p_queue_id bigint,
  p_workspace_id uuid,
  p_call_sid text,
  p_caller_number text
) RETURNS TABLE(agent_user_id uuid, entry_id bigint)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent record;
  v_entry_id bigint;
  v_now timestamptz := now();
BEGIN
  IF p_call_sid IS NULL OR btrim(p_call_sid) = '' OR NOT EXISTS (
    SELECT 1 FROM public.inbound_queue
    WHERE id = p_queue_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN;
  END IF;

  -- Serialize cooperating claims for this call, without blocking unrelated calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'inbound_offer:' || p_queue_id::text || ':' || p_call_sid, 0
  ));
  IF EXISTS (
    SELECT 1 FROM public.inbound_queue_entry
    WHERE queue_id = p_queue_id AND call_sid = p_call_sid
      AND status IN ('queued', 'offered', 'accepted')
  ) THEN
    -- A returned row means "dial this new offer" to the caller.
    RETURN;
  END IF;

  SELECT as2.user_id, as2.workspace_id INTO v_agent
  FROM public.agent_status as2
  JOIN public.inbound_queue_member iqm
    ON iqm.user_id = as2.user_id AND iqm.queue_id = p_queue_id
  WHERE as2.workspace_id = p_workspace_id
    AND as2.status = 'available'
    AND as2.current_queue_entry_id IS NULL
    AND as2.last_heartbeat_at > v_now - interval '2 minutes'
  LIMIT 1
  FOR UPDATE OF as2 SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.inbound_queue_entry
    (queue_id, workspace_id, call_sid, caller_number, status, offered_to_user_id, offered_at)
  VALUES
    (p_queue_id, p_workspace_id, p_call_sid, p_caller_number, 'offered', v_agent.user_id, v_now)
  ON CONFLICT (queue_id, call_sid) WHERE status IN ('queued', 'offered', 'accepted')
    DO NOTHING
  RETURNING id INTO v_entry_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.agent_status
  SET status = 'busy', current_queue_entry_id = v_entry_id,
      status_reason = 'inbound_offer', status_started_at = v_now, updated_at = v_now
  WHERE workspace_id = v_agent.workspace_id AND user_id = v_agent.user_id;

  INSERT INTO public.agent_status_event
    (workspace_id, user_id, from_status, to_status, reason, created_at)
  VALUES
    (p_workspace_id, v_agent.user_id, 'available', 'busy', 'inbound_offer', v_now);

  RETURN QUERY SELECT v_agent.user_id, v_entry_id;
END;
$function$;

COMMIT;
