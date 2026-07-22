-- Third sweep of queue RPCs left behind by the campaign_queue.status drop
-- (03b-drop-queue-status.sql). 20260716120000/130000/140000 fixed the enqueue
-- and dial paths; these are the remaining LIVE-callable functions that still
-- reference the dropped column, plus dead stale ones.
--
-- State model (see 20260716120000): queue_state 'queued' | 'assigned' |
-- 'dequeued' (terminal), with assigned_to_user_id/claimed_at for claims and
-- dequeued_at/dequeued_by/dequeued_reason for terminal rows. attempt_count
-- gates against campaign_queue_policy().max_attempts.
--
-- 1) reset_campaign — `UPDATE campaign_queue SET status = 'queued'` threw
--    `column "status" does not exist`. Called via rpcResetCampaign from
--    app/routes/api+/reset_campaign.action.server.ts.
-- 2) cancel_messages — same stale UPDATE, plus two more fatal references:
--    it joined `outreach_attempt.campaign_queue_id` and keyed on `message.id`,
--    and NEITHER column exists (attempts link to queue rows via the shared
--    (campaign_id, contact_id) pair; message's primary key is `sid`, there is
--    no id column). The uuid[] signature was therefore uncallable with real
--    data, and its app caller's lookup helper (`select id from message`) threw
--    too. Recreated sid-keyed as cancel_messages(text[]); the old uuid[]
--    overload is dropped. App wrappers in db-rpc.server.ts /
--    call-actions.server.ts updated in the same change.
-- 3) cancel_outreach_attempts — the call-side twin, broken identically
--    (`call` is also sid-keyed with no id column). Recreated as
--    cancel_outreach_attempts(text[]) taking call sids; bigint[] overload
--    dropped. Live via rpcCancelOutreachAttemptsByCallSids. Not in the
--    original finding list but the same bug.
-- 4) campaign_queue_has_pending_work(integer) 1-arg overload — references
--    cq.status AND makes every 1-arg call ambiguous against the 2-arg
--    (integer, interval DEFAULT NULL) overload, so both campaign-dispatch.ts
--    and try_complete_campaign_if_drained threw `function ... is not unique`.
--    Dropping it routes 1-arg calls to the correct 2-arg version.
-- 5) Dead + stale, no callers anywhere in the repo: get_queued_contacts,
--    get_contacts_by_households, get_contacts_by_campaign, get_last_online.
--    Dropped rather than rewritten.
--
-- NOT touched here: get_campaign_queue and select_and_update_campaign_contacts
-- also still reference cq.status. Leave a follow-up migration for those rather
-- than mixing that rewrite into this cancel/reset sweep.

-- 1) reset_campaign: full campaign reset — pause the campaign, return every
-- queue row (including terminal ones, matching the old blanket
-- status='queued') to a fresh queued state, and delete outreach attempts.
CREATE OR REPLACE FUNCTION public.reset_campaign(campaign_id_prop integer)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
    UPDATE campaign
    SET is_active = false, status = 'paused'
    WHERE id = campaign_id_prop;

    UPDATE campaign_queue
    SET queue_state = 'queued',
        assigned_to_user_id = NULL,
        provider_status = NULL,
        claimed_at = NULL,
        attempts = 0,
        attempt_count = 0,
        last_attempt_at = NULL,
        last_attempt_error = NULL,
        dequeued_at = NULL,
        dequeued_by = NULL,
        dequeued_reason = NULL
    WHERE campaign_id = campaign_id_prop;

    DELETE FROM outreach_attempt
    WHERE campaign_id = campaign_id_prop;
END;
$function$;

-- 2) cancel_messages: cancel the attempt and hand the queue row back. The
-- claim path (claim_campaign_queue_contacts) sets queue_state='assigned' and
-- increments attempt_count, so cancellation reverses exactly that. Unlike the
-- old blanket status='queued', terminal rows (dequeued_at set, e.g. opt-out)
-- stay terminal — a cancel must not resurrect them.
DROP FUNCTION IF EXISTS public.cancel_messages(uuid[]);

CREATE FUNCTION public.cancel_messages(message_sids text[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE outreach_attempt
    SET disposition = 'canceled'
    WHERE id IN (
        SELECT outreach_attempt_id
        FROM message
        WHERE sid = ANY(message_sids)
    );

    UPDATE campaign_queue
    SET queue_state = 'queued',
        assigned_to_user_id = NULL,
        provider_status = NULL,
        claimed_at = NULL,
        attempts = GREATEST(attempts - 1, 0),
        attempt_count = GREATEST(attempt_count - 1, 0)
    WHERE dequeued_at IS NULL
      AND id IN (
        SELECT cq.id
        FROM campaign_queue cq
        JOIN outreach_attempt oa
          ON oa.campaign_id = cq.campaign_id
         AND oa.contact_id = cq.contact_id
        JOIN message m ON m.outreach_attempt_id = oa.id
        WHERE m.sid = ANY(message_sids)
    );
END;
$function$;

-- 3) cancel_outreach_attempts: identical shape, keyed by call sids.
DROP FUNCTION IF EXISTS public.cancel_outreach_attempts(bigint[]);

CREATE FUNCTION public.cancel_outreach_attempts(call_sids text[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE outreach_attempt
    SET disposition = 'canceled'
    WHERE id IN (
        SELECT outreach_attempt_id
        FROM call
        WHERE sid = ANY(call_sids)
    );

    UPDATE campaign_queue
    SET queue_state = 'queued',
        assigned_to_user_id = NULL,
        provider_status = NULL,
        claimed_at = NULL,
        attempts = GREATEST(attempts - 1, 0),
        attempt_count = GREATEST(attempt_count - 1, 0)
    WHERE dequeued_at IS NULL
      AND id IN (
        SELECT cq.id
        FROM campaign_queue cq
        JOIN outreach_attempt oa
          ON oa.campaign_id = cq.campaign_id
         AND oa.contact_id = cq.contact_id
        JOIN call c ON c.outreach_attempt_id = oa.id
        WHERE c.sid = ANY(call_sids)
    );
END;
$function$;

-- 4) Remove the stale 1-arg overload; 1-arg calls now resolve to the 2-arg
-- (integer, interval DEFAULT NULL) version unambiguously.
DROP FUNCTION IF EXISTS public.campaign_queue_has_pending_work(integer);

-- 5) Dead functions still reading the dropped column.
DROP FUNCTION IF EXISTS public.get_queued_contacts(bigint);
DROP FUNCTION IF EXISTS public.get_contacts_by_households(integer, integer);
DROP FUNCTION IF EXISTS public.get_contacts_by_campaign(integer);
DROP FUNCTION IF EXISTS public.get_last_online();
