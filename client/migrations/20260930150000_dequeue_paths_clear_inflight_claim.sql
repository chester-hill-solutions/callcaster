-- #2208: clear the in-flight claim marker on every path that ends the
-- "a dispatcher has this row" window.
--
-- `campaign_queue.claimed_at` is now taken by the SMS dispatch immediately
-- before the provider call, so a row is visibly in flight while it is still
-- `queued`. `queue-status.ts` therefore lists `claimed_at` among the columns
-- the `dequeued` and `queued` transitions clear, and `check:queue-rpc-contract`
-- (which compares the plpgsql functions against that table) correctly refuses
-- to let those functions keep a stale claim.
--
-- A stale claim is not cosmetic: `reset_stale_campaign_queue_claims` and
-- `campaign_queue_has_pending_work` both key on `claimed_at`, and
-- `splitMessageCampaign` holds back any row whose claim reads as live. A
-- dequeued row that kept a claim would be invisible to the split's
-- `onlyQueued` filter yet still look claimed to those readers.
--
-- Bodies are reproduced from the live definitions and the only change is the
-- added `claimed_at = null`.

-- dequeue_contact: primary row and household fan-out.
CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
declare
  primary_rows integer;
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and workspace = p_workspace
    and (
      queue_state is null
      or queue_state = 'queued'
      -- #1260: the caller's own claim. Narrower than "any assigned row" on
      -- purpose — see 20260815120000 for why this is the race guard, not a
      -- hole. #1278 reports when it holds instead of hiding it.
      or (
        queue_state = 'assigned'
        and dequeued_by_id is not null
        and assigned_to_user_id = dequeued_by_id
      )
    );

  get diagnostics primary_rows = row_count;

  if group_on_household then
    update public.campaign_queue cq
    set
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      claimed_at = null,
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
      and (
        cq.queue_state is null
        or cq.queue_state = 'queued'
        -- Same widening, same guard: a household fan-out must never dequeue
        -- a sibling row another agent is currently holding.
        or (
          cq.queue_state = 'assigned'
          and dequeued_by_id is not null
          and cq.assigned_to_user_id = dequeued_by_id
        )
      );
  end if;

  return primary_rows;
end;
$function$;

-- dequeue_household: the whole household's rows.
CREATE OR REPLACE FUNCTION public.dequeue_household(
  contact_id_variable integer,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
begin
  update public.campaign_queue cq
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    claimed_at = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  from public.contact c1
  join public.contact c2
    on c1.household_id is not null and c1.household_id = c2.household_id
  where c1.id = contact_id_variable
    and cq.contact_id = c2.id;
end;
$function$;

-- handle_campaign_queue_entry: the requeue/reactivate branch. A row going back
-- into the pool is held by nobody, exactly as `assigned_to_user_id = NULL`
-- below already argues for `claimed_at`.
--
-- The `bigint` parameter types are load-bearing and must match the existing
-- signature exactly: a migration that declares `p_queue_order integer` does not
-- replace the function, it ADDS an overload, and every existing call becomes
-- "function is not unique". Reproduced while writing this file.
DROP FUNCTION IF EXISTS public.handle_campaign_queue_entry(bigint, bigint, integer, boolean);

CREATE OR REPLACE FUNCTION public.handle_campaign_queue_entry(
  p_contact_id bigint,
  p_campaign_id bigint,
  p_queue_order bigint DEFAULT NULL::bigint,
  p_requeue boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
    v_existing_id bigint;
    v_existing_live boolean;
    v_new_order bigint;
BEGIN
    -- Any existing entry for this contact/campaign (the UNIQUE constraint means
    -- there is at most one), plus whether it is currently live.
    SELECT id, (queue_state IS NULL OR queue_state IN ('queued', 'assigned'))
      INTO v_existing_id, v_existing_live
    FROM campaign_queue
    WHERE contact_id = p_contact_id
      AND campaign_id = p_campaign_id;

    -- Live entry and not requeueing: reuse it as-is.
    IF v_existing_id IS NOT NULL AND v_existing_live AND NOT p_requeue THEN
        RETURN v_existing_id;
    END IF;

    -- Next queue order if not supplied.
    IF p_queue_order IS NULL THEN
        SELECT COALESCE(MAX(queue_order), 0) + 1 INTO v_new_order
        FROM campaign_queue
        WHERE campaign_id = p_campaign_id;
    ELSE
        v_new_order := p_queue_order;
    END IF;

    -- Existing row that is terminal, or an explicit requeue: reactivate it in
    -- place. INSERT is impossible here — UNIQUE (campaign_id, contact_id) would
    -- reject it — so this branch is what makes re-adding a dequeued contact work.
    IF v_existing_id IS NOT NULL THEN
        UPDATE campaign_queue
        SET queue_state = 'queued',
            queue_order = v_new_order::integer,
            attempts = 0,
            -- A row going back into the pool is held by nobody. Without this,
            -- findActiveAssignedQueueForUser keeps handing the previous holder
            -- a contact anyone can now claim. `claimed_at` is the SMS-side
            -- equivalent of the same fact (#2208): a requeued row is not in
            -- flight, so a live claim on it would be a lie.
            assigned_to_user_id = NULL,
            provider_status = NULL,
            claimed_at = NULL,
            dequeued_at = NULL,
            dequeued_by = NULL,
            dequeued_reason = NULL
        WHERE id = v_existing_id
        RETURNING id INTO v_existing_id;

        RETURN v_existing_id;
    END IF;

    -- No existing row: insert a fresh one (workspace set by the BEFORE trigger).
    INSERT INTO campaign_queue
        (contact_id, campaign_id, queue_order, attempts, queue_state)
    VALUES
        (p_contact_id, p_campaign_id, v_new_order, 0, 'queued')
    RETURNING id INTO v_existing_id;

    RETURN v_existing_id;
END;
$function$;
