-- Second-sweep finding: the dial loop had MORE half-migrated queue RPCs than the
-- single one fixed in 20260716120000. Both below are called on live paths and
-- both throw at runtime, so even with enqueue working, no contact can actually
-- be claimed or auto-dialed.
--
-- 1) auto_dial_queue — still referenced the dropped campaign_queue.status column
--    (03a-rewrite-queue-rpcs.sql never covered it). It also overloaded `status`
--    to hold the assignee user id; the current schema splits that into
--    queue_state + assigned_to_user_id. Verified: threw `column cq.status does
--    not exist`. Called via db-rpc.server.ts:83.
--
-- 2) claim_campaign_queue_contacts (4-arg) — body was correctly migrated to
--    queue_state by 03a, but its RETURNS TABLE still declared integer/text for
--    columns that are bigint/uuid (campaign_queue.id, contact.id, contact.workspace),
--    so every call threw `structure of query does not match function result type`.
--    Only the signature is corrected here; the body is unchanged. Called via
--    campaign-dispatch.ts:231 (worker + sms-send paths).

CREATE OR REPLACE FUNCTION public.auto_dial_queue(
    campaign_id_variable integer,
    user_id_variable uuid
)
 RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_contact_id INT;
    v_queue_id INT;
    v_caller_id TEXT;
    v_contact_phone TEXT;
BEGIN
    SELECT cq.contact_id, cq.id AS queue_id, ca.caller_id, c.phone
    INTO v_contact_id, v_queue_id, v_caller_id, v_contact_phone
    FROM campaign_queue cq
    JOIN contact c ON cq.contact_id = c.id
    JOIN campaign ca ON cq.campaign_id = ca.id
    WHERE (cq.queue_state IS NULL OR cq.queue_state = 'queued')
        AND ca.id = campaign_id_variable
        AND c.phone IS NOT NULL
        AND c.phone != ''
    ORDER BY cq.queue_order ASC, cq.id ASC, cq.attempts DESC
    LIMIT 1;

    IF v_queue_id IS NOT NULL THEN
        -- Claim it: the old code stored the user id in `status`; the split
        -- schema records assignment as queue_state='assigned' + assigned_to_user_id.
        UPDATE campaign_queue
        SET queue_state = 'assigned',
            assigned_to_user_id = user_id_variable,
            attempts = attempts + 1
        WHERE id = v_queue_id;
    END IF;

    RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;
$function$;

-- claim_campaign_queue_contacts: fix the 4-arg (live) overload's result-type
-- declaration to match the real column types. Changing OUT columns requires a
-- DROP first. Also drop the dead 3-arg baseline overload, which still references
-- the removed campaign_queue.status column and is called by nothing (the app
-- always passes max_inflight → the 4-arg form).
DROP FUNCTION IF EXISTS public.claim_campaign_queue_contacts(integer, uuid, integer);
DROP FUNCTION IF EXISTS public.claim_campaign_queue_contacts(integer, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.claim_campaign_queue_contacts(
    campaign_id_pro integer,
    claimed_by_user_id uuid,
    claim_limit integer DEFAULT 1,
    max_inflight integer DEFAULT NULL::integer
)
 RETURNS TABLE(id bigint, contact_id bigint, phone text, workspace uuid, caller_id text)
 LANGUAGE plpgsql
AS $function$
declare
  effective_limit integer;
  policy record;
begin
  select * into policy from public.campaign_queue_policy();
  perform public.fail_exhausted_campaign_queue_contacts(campaign_id_pro);

  effective_limit := greatest(claim_limit, 1);
  if max_inflight is not null then
    if max_inflight <= 0 then
      return;
    end if;
    effective_limit := least(effective_limit, max_inflight);
  end if;

  return query
  with candidates as (
    select cq.id
    from public.campaign_queue cq
    where cq.campaign_id = campaign_id_pro
      and cq.dequeued_at is null
      and (cq.queue_state is null or cq.queue_state = 'queued')
      and cq.attempt_count < policy.max_attempts
    order by cq.id
    for update skip locked
    limit effective_limit
  ),
  claimed as (
    update public.campaign_queue cq
    set
      queue_state = 'assigned',
      assigned_to_user_id = claimed_by_user_id,
      provider_status = null,
      claimed_at = now(),
      attempt_count = cq.attempt_count + 1,
      last_attempt_at = now()
    from candidates c
    where cq.id = c.id
    returning cq.id, cq.contact_id, cq.campaign_id
  )
  select distinct on (contact.phone)
    claimed.id,
    contact.id as contact_id,
    contact.phone,
    contact.workspace,
    campaign.caller_id
  from claimed
  join public.contact contact on contact.id = claimed.contact_id
  join public.campaign campaign on campaign.id = claimed.campaign_id;
end;
$function$;
