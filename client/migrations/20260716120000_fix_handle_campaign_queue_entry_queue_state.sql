-- Fix handle_campaign_queue_entry: it still referenced the dropped
-- `campaign_queue.status` column, so EVERY path that adds a contact to a
-- campaign queue threw `column "status" does not exist`. That is the only
-- enqueue RPC (queue.server.ts -> rpcHandleCampaignQueueEntry), so no campaign
-- could be populated and nothing could dial.
--
-- `03a-rewrite-queue-rpcs.sql` migrated 11 sibling queue RPCs from `status` to
-- `queue_state` and 03b dropped the column, but this function was missed.
--
-- Beyond the column rename, this also corrects a latent upsert bug: the table
-- has UNIQUE (campaign_id, contact_id) with no state qualifier, so a contact
-- that was previously dequeued/failed cannot be re-INSERTed — the original
-- logic (match only non-terminal, else INSERT) would hit the unique violation
-- when re-adding such a contact. We now match ANY existing row and reactivate
-- it in place, which is the only correct behaviour under that constraint.
--
--   live (non-terminal) = queue_state IS NULL OR queue_state IN ('queued','assigned')
--   reactivate/fresh    = queue_state = 'queued'
-- `workspace` is populated by the campaign_queue_set_workspace trigger.

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
