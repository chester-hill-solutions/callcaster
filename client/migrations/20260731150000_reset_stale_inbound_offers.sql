-- Reclaim inbound queue offers whose status callback never arrived.
--
-- `claim_inbound_queue_entry` does two things atomically: it creates an
-- `inbound_queue_entry` in state 'offered', and it sets that agent's
-- `agent_status` to 'busy'. The offer is undone by `release_inbound_offer`,
-- which is only ever called from the Twilio status callback
-- (/api/acd-router/agent-status) or when dialAgent itself throws.
--
-- So if that callback never arrives — a Twilio delivery failure, a deploy that
-- drops the request, a 500, a network blip — the entry stays 'offered' and the
-- AGENT STAYS 'busy' FOREVER. They are never offered another inbound call, and
-- nothing anywhere notices. One lost webhook permanently removes an agent from
-- inbound routing until someone edits the database by hand.
--
-- Every comparable queue in this system already guards this: background jobs
-- have a claim TTL reset by resetStaleClaims(), and the campaign queue has
-- reset_stale_campaign_queue_claims(). The inbound queue had no equivalent.
--
-- The default is deliberately far beyond any legitimate offer:
-- INBOUND_OFFER_TIMEOUT_SECONDS is 25s, so a live offer resolves well inside
-- two minutes. Anything older is definitively stale.
--
-- Releasing through release_inbound_offer rather than updating rows directly
-- keeps one definition of what "release" means — it also returns the agent to
-- 'available' and writes the agent_status_event audit row.

CREATE OR REPLACE FUNCTION public.reset_stale_inbound_offers(
    stale_after interval DEFAULT '2 minutes'
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    v_entry record;
    v_count integer := 0;
BEGIN
    FOR v_entry IN
        SELECT id
          FROM public.inbound_queue_entry
         WHERE status = 'offered'
           AND offered_at IS NOT NULL
           AND offered_at < now() - stale_after
         ORDER BY offered_at
         LIMIT 500
           FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM public.release_inbound_offer(v_entry.id, 'timed_out');
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;
