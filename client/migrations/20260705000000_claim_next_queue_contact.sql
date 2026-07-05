-- Atomic queue claim for predictive dialer. Replaces the non-atomic select-then-update
-- in auto_dial_queue by serializing per-campaign claims with an advisory lock and
-- locking the candidate row with FOR UPDATE SKIP LOCKED.

CREATE OR REPLACE FUNCTION public.claim_next_queue_contact(
    campaign_id_variable integer,
    user_id_variable uuid
) RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_contact_id INT;
    v_queue_id INT;
    v_caller_id TEXT;
    v_contact_phone TEXT;
    v_lock_key BIGINT;
BEGIN
    -- Serialize per-campaign claims to prevent duplicate dialing races.
    v_lock_key := hashtext('claim_queue:' || campaign_id_variable::text);
    PERFORM pg_advisory_lock(v_lock_key);

    SELECT cq.contact_id, cq.id AS queue_id, ca.caller_id, c.phone
    INTO v_contact_id, v_queue_id, v_caller_id, v_contact_phone
    FROM campaign_queue cq
    JOIN contact c ON cq.contact_id = c.id
    JOIN campaign ca ON cq.campaign_id = ca.id
    WHERE cq.status = 'queued' AND cq.campaign_id = campaign_id_variable
        AND c.phone IS NOT NULL
        AND c.phone != ''
    ORDER BY cq.queue_order ASC, cq.id ASC, cq.attempts DESC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_queue_id IS NOT NULL THEN
        UPDATE campaign_queue
        SET status = 'assigned',
            assigned_to_user_id = user_id_variable,
            claimed_at = now(),
            attempts = attempts + 1,
            queue_state = 'assigned'
        WHERE id = v_queue_id AND status = 'queued';
    END IF;

    -- Advisory locks are released automatically at transaction end; unlock explicitly
    -- so the function can be safely called outside of an explicit transaction.
    PERFORM pg_advisory_unlock(v_lock_key);

    RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;
$$;

-- Partial unique index prevents duplicate active claims for the same campaign/contact
-- if the advisory lock is bypassed or if callers write status directly.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_queue_unique_assigned_contact
    ON public.campaign_queue (campaign_id, contact_id)
    WHERE status = 'assigned';
