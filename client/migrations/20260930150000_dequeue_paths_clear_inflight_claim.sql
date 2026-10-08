-- #2208: clear the in-flight claim marker when a queue row re-enters the pool.
--
-- `campaign_queue.claimed_at` is now taken by the SMS dispatch immediately
-- before the provider call, so a row is visibly in flight while it is still
-- `queued`. `queue-status.ts` therefore lists `claimed_at` among the columns
-- the `queued` transition clears, and `check:queue-rpc-contract` (which
-- compares the plpgsql functions against that table) correctly refuses to let
-- this function keep a stale claim.
--
-- This is the ONLY place that needs it. `handle_campaign_queue_entry` is the
-- single transition that sets `dequeued_at = NULL`, i.e. the single place an
-- already-dequeued row becomes visible to a `claimed_at` reader again. Every
-- other reader guards on `dequeued_at is null` (`campaign_queue_has_pending_work`
-- and `reset_stale_campaign_queue_claims` both do), and the campaign split
-- reads only `onlyQueued` rows — so a marker left on a dequeued row cannot be
-- observed. Rewriting `dequeue_contact` and `dequeue_household` to null an
-- unreadable column was rejected: it is a hot path, and `dequeue_contact`
-- carries a documented race guard and a household fan-out that are worth more
-- than the hygiene.
--
-- The `bigint` parameter types are load-bearing and must match the existing
-- signature exactly: a migration that declares `p_queue_order integer` does not
-- replace the function, it ADDS an overload, and every existing call becomes
-- "function is not unique". Reproduced while writing this file.
DROP FUNCTION IF EXISTS public.handle_campaign_queue_entry(bigint, bigint, integer, boolean);

-- handle_campaign_queue_entry: the requeue/reactivate branch. A row going back
-- into the pool is held by nobody, exactly as `assigned_to_user_id = NULL`
-- below already argues for `claimed_at`.
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
