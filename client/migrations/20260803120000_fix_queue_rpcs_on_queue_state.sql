-- Finish the cq.status → queue_state rewrite that 20260722120000 deferred.
--
-- That migration fixed the cancel/reset RPCs and said, in its own header:
--   "NOT touched here: get_campaign_queue and select_and_update_campaign_contacts
--    also still reference cq.status. Leave a follow-up migration for those."
-- This is that follow-up. No follow-up was ever written, so
-- `api+/queues.loader.server.ts` — the campaign queue loader — raised
-- `column cq.status does not exist` on every single call. Reproduced against
-- PostgreSQL 18.4 before this migration; the column has been `queue_state`
-- since 20260716120000.
--
-- Two changes:
--
-- 1) select_and_update_campaign_contacts: filter on queue_state, and claim the
--    way the live claim path claims. The old body did `SET status = v_user_id`
--    — the Supabase-era pattern of writing the actor's id into the status
--    column itself. The modern shape (claim_next_queue_contact) is
--    `queue_state = 'assigned'` plus `assigned_to_user_id`, so this now matches
--    it, including the attempts bump and last_attempt_at. Without the bump this
--    path would claim rows that the max-attempts guards never see.
--
-- 2) DROP get_campaign_queue(bigint). Its body has the same dead cq.status
--    reference, and its mere existence makes every 1-arg call ambiguous against
--    the healthy (integer) overload — the identical hazard 20260722120000
--    resolved for campaign_queue_has_pending_work by dropping the extra
--    overload rather than rewriting it. `db-rpc.server.ts` calls the 1-arg form.

CREATE OR REPLACE FUNCTION public.select_and_update_campaign_contacts(
  p_campaign_id integer,
  p_initial_limit integer
)
RETURNS TABLE(queue_id integer, contact_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- uuid, not TEXT: auth.uid() returns uuid and campaign_queue
    -- .assigned_to_user_id is uuid. The old body declared TEXT because it wrote
    -- the id into the `status` text column instead of a real actor column.
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH base_contacts AS (
        SELECT
            cq.id::INTEGER AS queue_id,
            c.id::INTEGER AS contact_id,
            CASE
                WHEN c.address IS NULL OR c.address = '' THEN 'NO_ADDRESS_' || c.id::TEXT
                ELSE c.address
            END AS effective_address,
            ROW_NUMBER() OVER (
                ORDER BY cq.attempts ASC, cq.queue_order ASC, c.id
            ) AS overall_rank,
            CASE
                WHEN c.address IS NULL OR c.address = '' THEN 1
                ELSE 0
            END as is_no_address
        FROM
            campaign_queue cq
            JOIN contact c ON c.id = cq.contact_id
        WHERE
            cq.campaign_id = p_campaign_id
            -- NULL is treated as unclaimed, matching claim_next_queue_contact.
            AND (cq.queue_state IS NULL OR cq.queue_state = 'queued')
            AND c.phone IS NOT NULL
            AND c.phone != ''
    ),
    address_groups AS (
        SELECT
            effective_address,
            MIN(overall_rank) as first_rank,
            COUNT(*) as address_count,
            MAX(is_no_address) as is_no_address
        FROM base_contacts
        GROUP BY effective_address
    ),
    running_totals AS (
        SELECT
            effective_address,
            first_rank,
            address_count,
            is_no_address,
            SUM(CASE WHEN is_no_address = 1 THEN 1 ELSE address_count END) OVER (
                ORDER BY first_rank
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as running_total
        FROM address_groups
    )
    UPDATE campaign_queue cq
    SET queue_state = 'assigned',
        assigned_to_user_id = v_user_id,
        provider_status = NULL,
        attempts = COALESCE(cq.attempts, 0) + 1,
        last_attempt_at = now()
    FROM base_contacts bc
    JOIN running_totals rt ON bc.effective_address = rt.effective_address
    WHERE cq.id = bc.queue_id
    AND (
        -- No address: take only if this row itself is within the limit.
        (rt.is_no_address = 1 AND bc.overall_rank <= p_initial_limit)
        OR
        -- Real address: take the whole household if it starts within the limit.
        (rt.is_no_address = 0 AND rt.running_total <= p_initial_limit)
    )
    RETURNING bc.queue_id::INTEGER, bc.contact_id::INTEGER;

END;
$$;

DROP FUNCTION IF EXISTS public.get_campaign_queue(bigint);
