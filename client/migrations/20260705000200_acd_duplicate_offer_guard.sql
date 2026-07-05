-- Guard against duplicate inbound queue offers for the same caller.

-- Partial unique index: at most one non-terminal entry per (queue, call).
-- 'completed', 'abandoned', and 'failed' are terminal; every other status
-- is considered an active/in-flight entry and blocks a new row.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_queue_entry_queue_call_sid_active_uidx
  ON public.inbound_queue_entry (queue_id, call_sid)
  WHERE status NOT IN ('completed', 'abandoned', 'failed');

-- Update claim_inbound_queue_entry to return an existing non-terminal entry
-- for the same (queue_id, call_sid) instead of creating a duplicate offer.
CREATE OR REPLACE FUNCTION public.claim_inbound_queue_entry(
  p_queue_id bigint,
  p_workspace_id uuid,
  p_call_sid text,
  p_caller_number text
) RETURNS TABLE(agent_user_id uuid, entry_id bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing record;
  v_agent record;
  v_entry_id bigint;
  v_now timestamptz := now();
BEGIN
  -- Defensive pre-check: if a non-terminal entry already exists for this
  -- caller, return it so callers cannot pivot a single call to multiple offers.
  SELECT id, offered_to_user_id
  INTO v_existing
  FROM public.inbound_queue_entry
  WHERE queue_id = p_queue_id
    AND call_sid = p_call_sid
    AND status NOT IN ('completed', 'abandoned', 'failed')
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.offered_to_user_id, v_existing.id;
    RETURN;
  END IF;

  SELECT as2.user_id, as2.workspace_id
  INTO v_agent
  FROM public.agent_status as2
  JOIN public.inbound_queue_member iqm
    ON iqm.user_id = as2.user_id AND iqm.queue_id = p_queue_id
  WHERE as2.workspace_id = p_workspace_id
    AND as2.status = 'available'
    AND as2.current_queue_entry_id IS NULL
    AND as2.last_heartbeat_at > v_now - interval '2 minutes'
  LIMIT 1
  FOR UPDATE OF as2 SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.inbound_queue_entry
    (queue_id, workspace_id, call_sid, caller_number, status, offered_to_user_id, offered_at)
  VALUES
    (p_queue_id, p_workspace_id, p_call_sid, p_caller_number, 'offered', v_agent.user_id, v_now)
  RETURNING id INTO v_entry_id;

  UPDATE public.agent_status
  SET status = 'busy',
      current_queue_entry_id = v_entry_id,
      status_reason = 'inbound_offer',
      status_started_at = v_now,
      updated_at = v_now
  WHERE workspace_id = v_agent.workspace_id
    AND user_id = v_agent.user_id;

  INSERT INTO public.agent_status_event
    (workspace_id, user_id, from_status, to_status, reason, created_at)
  VALUES
    (p_workspace_id, v_agent.user_id, 'available', 'busy', 'inbound_offer', v_now);

  RETURN QUERY SELECT v_agent.user_id, v_entry_id;
END;
$$;
