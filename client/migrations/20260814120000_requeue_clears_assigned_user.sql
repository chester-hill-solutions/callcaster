-- handle_campaign_queue_entry leaves a stale assignee on a re-queued row.
--
-- Found by the new queue-RPC contract gate (#1240 B2), not in production. The
-- 'queued' transition in app/lib/queue-status.ts writes the full column set —
-- assigned_to_user_id, dequeued_at, dequeued_by, dequeued_reason,
-- provider_status, queue_state — because a row returning to the pool must not
-- keep any trace of the claim it is leaving. 20260716120000 rebuilt this
-- function's reactivate branch to clear provider_status and the dequeued_*
-- trio, but not assigned_to_user_id.
--
-- The branch is reachable with that column still set: it runs when the row is
-- terminal (assigned_to_user_id already NULL, so no effect) OR when the caller
-- passes p_requeue — and `rpcHandleCampaignQueueEntry` passes it straight
-- through, so re-adding a contact that a caller currently holds takes the
-- second path and keeps `assigned_to_user_id = <that caller>` on a row whose
-- queue_state is now 'queued'.
--
-- That is not cosmetic. `findActiveAssignedQueueForUser` in
-- app/lib/campaign-queue-db.server.ts selects on
--   dequeued_at IS NULL AND assigned_to_user_id = <user>
-- with no queue_state predicate, so the caller keeps being handed a contact
-- that is back in the pool and claimable by anyone else, and
-- `releaseAssignedQueueForUser` counts it as theirs.
--
-- One added assignment. Every sibling that returns a row to 'queued' —
-- reset_campaign, cancel_messages, cancel_outreach_attempts,
-- reset_stale_campaign_queue_claims — already nulls this column; this brings
-- the enqueue path in line with them. The rest of the body is byte-identical
-- to 20260716120000, re-stated in full because CREATE OR REPLACE FUNCTION has
-- no partial form.

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
            queue_order = v_new_order,
            attempts = 0,
            -- A row going back into the pool is held by nobody. Without this,
            -- findActiveAssignedQueueForUser keeps handing the previous holder
            -- a contact anyone can now claim.
            assigned_to_user_id = NULL,
            provider_status = NULL,
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
