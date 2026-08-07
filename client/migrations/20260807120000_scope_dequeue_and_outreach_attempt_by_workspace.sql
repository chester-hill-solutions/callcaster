-- Close two cross-tenant write gaps found in the 2026-08-05 call-screen audit
-- and re-verified 2026-08-07: both functions write via a client-supplied id
-- with no workspace predicate, reachable from /api/dial (contact_id, queue_id),
-- /api/hangup (contact_id), and /api/questions (queue_id) — none of which
-- validate that the id belongs to the calling workspace before passing it
-- through.
--
-- dequeue_contact: filtered only on contact_id. A member of workspace A who
-- can produce ANY contact_id (their own dial/hangup flow accepts one from the
-- client) could dequeue workspace B's contact — and, worse, group_on_household
-- joined contact.household_id with no workspace filter at all, so a
-- household_id collision across workspaces (not supposed to happen, but
-- nothing enforced it) would fan out the dequeue further.
--
-- create_outreach_attempt: the outreach_attempt INSERT is correctly tagged
-- with wks_id, but the campaign_queue attempts-counter UPDATE was filtered
-- only on queue_id — bumping another workspace's queue row's attempt count
-- from a request attributed to this workspace's outreach_attempt.
--
-- Both fixes add a required workspace parameter and filter every write (and,
-- for dequeue_contact, every read used to decide what to write) by it. Call
-- sites are updated in the same commit: app/lib/db-rpc.server.ts and its six
-- (dequeue) / six (create) callers.

DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and workspace = p_workspace
    and (queue_state is null or queue_state = 'queued');

  if group_on_household then
    update public.campaign_queue cq
    set
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2 on c1.household_id is not null and c1.household_id = c2.household_id
    where
      c1.id = passed_contact_id
      and c1.workspace = p_workspace
      and c2.workspace = p_workspace
      and cq.contact_id = c2.id
      and cq.workspace = p_workspace
      and (cq.queue_state is null or cq.queue_state = 'queued');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_outreach_attempt(con_id bigint, cam_id bigint, usr_id uuid, wks_id uuid, queue_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_outreach_attempt_id bigint;
BEGIN
  INSERT INTO outreach_attempt (contact_id, campaign_id, user_id, workspace)
  VALUES (con_id, cam_id, usr_id, wks_id)
  RETURNING id INTO new_outreach_attempt_id;

  UPDATE campaign_queue
  SET attempts = attempts + 1
  WHERE id = queue_id
    AND workspace = wks_id;

  RETURN new_outreach_attempt_id;
END;
$$;
