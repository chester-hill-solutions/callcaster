-- Atomic claiming for the manual-dial (dial_type 'call') path.
--
-- The 2026-08-05 call-screen audit found the manual path has none of the
-- claim discipline the predictive path gained in 20260731120000:
--
-- 1) select_and_update_campaign_contacts (the "fetchMore" RPC, fired from
--    every "Save and Next") was check-then-act: the CTE selected `queued`
--    rows with no lock, and the UPDATE re-checked only `cq.id = bc.queue_id`
--    — which still holds after a concurrent claimer wins EvalPlanQual — and
--    RETURNING came from the CTE, so BOTH concurrent callers received the
--    same contacts. Two agents ended up dialing the same person. Fixed the
--    same way claim_next_queue_contact fixed the auto-dialer: FOR UPDATE
--    SKIP LOCKED on the candidate rows (in a plain first CTE — FOR UPDATE
--    is not allowed alongside window functions, so ranking happens in a
--    second CTE over the locked rows), a queue_state re-check in the UPDATE
--    predicate, and RETURNING from the updated table.
--
-- 2) claim_queue_entry_for_dial is new: /api/dial had no claim at all — it
--    dialed whatever queue_id the client sent. A double-click, two tabs, or
--    two agents holding the same unclaimed row each placed a REAL outbound
--    call to a real person. The claim locks the specific row (FOR UPDATE;
--    no SKIP LOCKED here — a locked row means someone else is mid-claim and
--    the caller must know, not silently move on), verifies workspace and
--    campaign ownership, rejects rows claimed by another agent, and refuses
--    to claim while the same contact already has a live call on this
--    campaign. Distinct return codes let the route give the agent a precise
--    reason.
--
-- Contract notes:
-- * Like claim_next_queue_contact, opt_out filtering stays in the caller.
-- * 'unavailable' covers both "row is locked by a concurrent claim" and
--   "row does not exist / wrong campaign / wrong workspace" — the caller
--   treats every non-'claimed' result as a refusal to dial.

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
        -- FOR UPDATE locks EVERY unclaimed row in the campaign on every call —
        -- verified against a live Postgres: two concurrent calls with
        -- p_initial_limit 3 against an unbounded lock left the second caller
        -- with ZERO rows every time, because the first call's lock covered
        -- every candidate, not just the 3 it claimed, blocking everything
        -- until commit. That serializes every agent's "Save and Next" on one
        -- campaign — the opposite of this fix's goal. The multiplier bounds
        -- the lock to a superset large enough to satisfy household bundling
        -- in the common case; re-verified at 100 unclaimed rows (the real
        -- caller — callscreenActions.ts fetchMore — never requests more than
        -- 10) that two concurrent calls land on disjoint rows. Trade-off,
        -- also verified: when the REMAINING unclaimed queue is smaller than
        -- the bound (a nearly-drained campaign), this still locks all of it
        -- for the call's duration — milliseconds in production, not the
        -- multi-second sleep used to make the race observable above. A
        -- pathologically large single household can also yield fewer than
        -- p_initial_limit contacts in one call; both are far safer failure
        -- modes than the duplicate-assignment this migration fixes.
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

CREATE OR REPLACE FUNCTION public.claim_queue_entry_for_dial(
    p_queue_id bigint,
    p_campaign_id bigint,
    p_workspace uuid,
    p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_row public.campaign_queue%ROWTYPE;
BEGIN
    -- NOWAIT-style semantics via a targeted lock: if another dial holds this
    -- exact row we surface 'unavailable' rather than dialing the same person.
    SELECT * INTO v_row
      FROM public.campaign_queue cq
     WHERE cq.id = p_queue_id
       AND cq.campaign_id = p_campaign_id
       AND cq.workspace = p_workspace
       FOR UPDATE SKIP LOCKED;

    IF v_row.id IS NULL THEN
        RETURN 'unavailable';
    END IF;

    IF v_row.assigned_to_user_id IS NOT NULL AND v_row.assigned_to_user_id <> p_user_id THEN
        RETURN 'claimed_by_other';
    END IF;

    IF v_row.queue_state IS NOT NULL AND v_row.queue_state NOT IN ('queued', 'assigned') THEN
        RETURN 'not_queued';
    END IF;

    -- Same-agent double-click / second-tab guard: refuse while this contact
    -- already has a live call on this campaign. The window check bounds the
    -- lookup so an ancient stuck row cannot block dialing forever.
    IF EXISTS (
        SELECT 1
          FROM public.call c
         WHERE c.contact_id = v_row.contact_id
           AND c.campaign_id = p_campaign_id
           AND c.workspace = p_workspace
           -- c.status is the call_status enum; cast to text before comparing
           -- so this only depends on the enum's known labels (never NULL).
           AND c.status::text IN ('queued', 'initiated', 'ringing', 'in-progress')
           AND c.date_created::timestamptz > now() - interval '2 hours'
    ) THEN
        RETURN 'active_call';
    END IF;

    UPDATE public.campaign_queue
       SET assigned_to_user_id = p_user_id,
           queue_state = COALESCE(queue_state, 'queued')
     WHERE id = v_row.id;

    RETURN 'claimed';
END;
$function$;
