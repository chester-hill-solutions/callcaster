-- Create claim_next_queue_contact: the auto-dialer's claim RPC, which the
-- application has been calling since #1091 but which was never created.
--
-- `campaign-queue-db.server.ts` runs
--   select * from claim_next_queue_contact($campaignId, $userId::uuid)
-- and no migration anywhere defines that function, so every call raised
--   ERROR: function claim_next_queue_contact(integer, uuid) does not exist
--
-- That is the claim used by runAutoDialerTurn, which is invoked from
-- `/api/auto-dial/status` — the Twilio status callback that chains the *next*
-- dial. So the predictive/power dialer stopped after the first call of every
-- session: the turn threw, triggerAutoDialer rethrew, and no further contact
-- was ever claimed. Nothing in the test suite covers a dialer turn, so this
-- stayed green.
--
-- The rename happened in application code only. `auto_dial_queue`, the previous
-- name, still exists in the database and is still correct for the split
-- (queue_state / assigned_to_user_id) schema — but its only wrapper,
-- rpcAutoDialQueue, no longer has any callers.
--
-- This is deliberately a new function rather than a rename of auto_dial_queue,
-- because auto_dial_queue has a race that must not be carried forward: it
-- SELECTs a row and then UPDATEs it in a separate statement with no row lock,
-- so two concurrent dialer turns can select the same queue row and both dial
-- it. On a predictive dialer that is a duplicate call to a real person and a
-- duplicate charge. FOR UPDATE SKIP LOCKED makes the claim atomic; concurrent
-- turns take different rows instead of colliding.
--
-- Contract note: this intentionally does NOT filter on contact.opt_out. The
-- caller claims, checks opt_out, and dequeues opted-out rows (the
-- "belt-and-suspenders opt-out guard"). Filtering here would hide those rows
-- from the claim loop and leave them sitting in `queued` forever instead of
-- being cleaned up.

CREATE OR REPLACE FUNCTION public.claim_next_queue_contact(
    campaign_id_variable integer,
    user_id_variable uuid
)
RETURNS TABLE(contact_id integer, queue_id integer, caller_id text, contact_phone text)
LANGUAGE plpgsql
AS $function$
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
           last_attempt_at = now()
     WHERE id = v_queue_id;

    RETURN QUERY SELECT v_contact_id, v_queue_id, v_caller_id, v_contact_phone;
END;
$function$;
