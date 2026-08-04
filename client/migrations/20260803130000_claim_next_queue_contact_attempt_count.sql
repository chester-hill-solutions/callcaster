-- campaign_queue has two attempt counters, and the live dial path incremented
-- the one nothing reads.
--
-- claim_next_queue_contact bumps `attempts`. Every max-attempts guard reads
-- `attempt_count` — campaign_queue_has_pending_work,
-- reset_stale_campaign_queue_claims, fail_exhausted_campaign_queue_contacts,
-- requeue_campaign_queue_contact, claim_campaign_queue_contacts. Confirmed by
-- querying pg_proc on PostgreSQL 18.4, not by reading the repo.
--
-- So on the predictive dialer path `attempt_count` stayed 0 forever: no contact
-- was ever marked exhausted and the max-attempts safety net could not fire. The
-- batch RPC does increment it, so the two claim paths disagreed about how many
-- times a contact had been tried.
--
-- This bumps both. `attempts` keeps its existing meaning and this migration
-- changes NOTHING else about the function — the body below is the deployed
-- source with one assignment added. Collapsing the two columns is a separate
-- change: it needs a backfill decision for rows where they already diverge.

CREATE OR REPLACE FUNCTION public.claim_next_queue_contact(campaign_id_variable integer, user_id_variable uuid)
RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_queue_id INT;
    v_contact_id INT;
    v_caller_id TEXT;
    v_contact_phone TEXT;
BEGIN
    -- Lock the candidate row so a concurrent turn cannot claim the same
    -- contact. SKIP LOCKED means the other turn moves to the next contact
    -- rather than blocking behind this one.
    SELECT cq.id, cq.contact_id, ca.caller_id, c.phone
      INTO v_queue_id, v_contact_id, v_caller_id, v_contact_phone
      FROM campaign_queue cq
      JOIN contact c ON c.id = cq.contact_id
      JOIN campaign ca ON ca.id = cq.campaign_id
     WHERE ca.id = campaign_id_variable
       AND (cq.queue_state IS NULL OR cq.queue_state = 'queued')
       AND cq.dequeued_at IS NULL
       AND c.phone IS NOT NULL
       AND c.phone <> ''
     ORDER BY cq.queue_order ASC, cq.id ASC
     LIMIT 1
       FOR UPDATE OF cq SKIP LOCKED;

    IF v_queue_id IS NULL THEN
        RETURN;  -- no claimable contact; caller treats an empty result as "queue drained"
    END IF;

    UPDATE campaign_queue
       SET queue_state = 'assigned',
           assigned_to_user_id = user_id_variable,
           provider_status = NULL,
           attempts = COALESCE(attempts, 0) + 1,
           -- The column every max-attempts guard actually reads. Incrementing
           -- only `attempts` left this at 0 on the live dial path, so
           -- fail_exhausted_campaign_queue_contacts never fired.
           attempt_count = COALESCE(attempt_count, 0) + 1,
           -- Without this the claim is INVISIBLE to both guards that read it:
           -- reset_stale_campaign_queue_claims requires `claimed_at is not
           -- null`, so it could never reclaim a row this function assigned; and
           -- campaign_queue_has_pending_work counts an assigned row as pending
           -- only when claimed_at is set and recent, so an assigned-but-
           -- unclaimed_at row read as "no pending work" immediately — letting
           -- try_complete_campaign_if_drained finish a campaign whose contacts
           -- were still sitting assigned and undialled.
           claimed_at = now(),
           last_attempt_at = now()
     WHERE id = v_queue_id;

    RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;

$$;
