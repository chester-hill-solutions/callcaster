-- Manual "Save and Next" claim (select_and_update_campaign_contacts) was still
-- omitting attempt_count and claimed_at when it flips a row to 'assigned' —
-- the exact drift migration 20260803130000 fixed for the predictive path's
-- claim_next_queue_contact, but the manual path never got the same fix.
--
-- Consequences on the manual path (verified against drizzle/0000_baseline.sql):
--   1) fail_exhausted_campaign_queue_contacts keys on attempt_count >=
--      max_attempts. Leaving attempt_count at 0 means manually-claimed
--      contacts are never marked exhausted, so the max-attempts / redial-cap
--      guard (TCPA/CRTC) is dead on this path.
--   2) reset_stale_campaign_queue_claims requires queue_state = 'assigned'
--      AND claimed_at IS NOT NULL, and campaign_queue_has_pending_work counts
--      an assigned row as pending only when claimed_at is set. A claimed-then-
--      abandoned batch has claimed_at NULL, so it is stranded in 'assigned'
--      forever — never returned to 'queued', never re-servable.
--
-- This CREATE OR REPLACE keeps the concurrency fix from 20260805120000
-- verbatim (FOR UPDATE SKIP LOCKED candidate lock, household bundling, queue_state
-- re-check) and only adds `attempt_count = COALESCE(attempt_count,0)+1` and
-- `claimed_at = now()` to the UPDATE SET, mirroring claim_next_queue_contact.

CREATE OR REPLACE FUNCTION public.select_and_update_campaign_contacts(
  p_campaign_id integer,
  p_initial_limit integer
)
RETURNS TABLE(queue_id integer, contact_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH locked_rows AS (
        -- Plain SELECT so FOR UPDATE is legal; SKIP LOCKED makes concurrent
        -- fetchMore calls take disjoint rows instead of colliding.
        SELECT
            cq.id AS queue_id,
            cq.contact_id,
            cq.attempts,
            cq.queue_order,
            c.id AS c_id,
            c.address
        FROM
            campaign_queue cq
            JOIN contact c ON c.id = cq.contact_id
        WHERE
            cq.campaign_id = p_campaign_id
            -- NULL is treated as unclaimed, matching claim_next_queue_contact.
            AND (cq.queue_state IS NULL OR cq.queue_state = 'queued')
            AND c.phone IS NOT NULL
            AND c.phone != ''
        -- Same ordering the ranking below uses. Without this ORDER BY + LIMIT,
        -- FOR UPDATE locks EVERY unclaimed row in the campaign on every call.
        -- The multiplier bounds the lock to a superset large enough to satisfy
        -- household bundling in the common case (see 20260805120000 for the
        -- full rationale and live-Postgres verification).
        ORDER BY cq.attempts ASC, cq.queue_order ASC, c.id ASC
        LIMIT GREATEST(p_initial_limit, 1) * 25
        FOR UPDATE OF cq SKIP LOCKED
    ),
    base_contacts AS (
        SELECT
            lr.queue_id::INTEGER AS queue_id,
            lr.c_id::INTEGER AS contact_id,
            CASE
                WHEN lr.address IS NULL OR lr.address = '' THEN 'NO_ADDRESS_' || lr.c_id::TEXT
                ELSE lr.address
            END AS effective_address,
            ROW_NUMBER() OVER (
                ORDER BY lr.attempts ASC, lr.queue_order ASC, lr.c_id
            ) AS overall_rank,
            CASE
                WHEN lr.address IS NULL OR lr.address = '' THEN 1
                ELSE 0
            END as is_no_address
        FROM locked_rows lr
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
        -- fail_exhausted_campaign_queue_contacts keys on attempt_count, and
        -- reset_stale_campaign_queue_claims / campaign_queue_has_pending_work
        -- key on claimed_at. Without these two the max-attempts guard is dead
        -- and abandoned claims are stranded (see migration header).
        attempt_count = COALESCE(cq.attempt_count, 0) + 1,
        claimed_at = now(),
        last_attempt_at = now()
    FROM base_contacts bc
    JOIN running_totals rt ON bc.effective_address = rt.effective_address
    WHERE cq.id = bc.queue_id
    -- Rows are locked by locked_rows, so this re-check is belt-and-braces
    -- against any future edit that weakens the lock.
    AND (cq.queue_state IS NULL OR cq.queue_state = 'queued')
    AND (
        -- No address: take only if this row itself is within the limit.
        (rt.is_no_address = 1 AND bc.overall_rank <= p_initial_limit)
        OR
        -- Real address: take the whole household if it starts within the limit.
        (rt.is_no_address = 0 AND rt.running_total <= p_initial_limit)
    )
    RETURNING cq.id::INTEGER, cq.contact_id::INTEGER;

END;
$$;
