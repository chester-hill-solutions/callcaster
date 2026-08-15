-- dequeue_contact silently no-oped on the row it is almost always called for.
--
-- Both UPDATEs in the deployed definition (20260807120000) were guarded with
-- `queue_state is null or queue_state = 'queued'`. Every RPC-mode call site
-- fires AFTER the row has been claimed, i.e. while it is `assigned`:
--
--   app/lib/auto-dial.server.ts            park path (household=false) and the
--                                          post-dial dequeue (household=true),
--                                          both immediately after
--                                          claim_next_queue_contact set
--                                          queue_state='assigned'
--   app/routes/api+/auto-dial/status...    terminal call-status dequeue
--   app/routes/api+/auto-dial/$roomId...   machine-answer dequeue
--   app/routes/api+/hangup...              agent hangup dequeue
--   app/routes/api+/queues...              manual dequeue from the queue UI
--
-- Verified against a live Postgres 18 (docker-compose.dev.yml) before this
-- migration: with the primary row in queue_state='assigned' and a household
-- sibling in 'queued', `dequeue_contact(contact, false, ws, assignee, ...)`
-- left the primary completely untouched (queue_state 'assigned', dequeued_at
-- null), and `dequeue_contact(contact, true, ws, assignee, ...)` dequeued only
-- the SIBLING. The assigned row then sat there until
-- reset_stale_campaign_queue_claims flipped it back to 'queued' — so a contact
-- deliberately PARKED after an ambiguous dial failure ("call may exist at
-- Twilio; parked for review, not redialed") gets re-surfaced and redialed,
-- which is the exact outcome the park path exists to prevent.
--
-- WHY NOT JUST DROP THE PREDICATE. It is a real race guard, not an accident:
-- between an agent deciding to dequeue and the RPC running, the row can be
-- reclaimed (reset_stale_campaign_queue_claims requeues it, then another
-- agent's claim takes it). An unconditional UPDATE would let a stale dequeue
-- kill a call another agent is actively placing. The same applies to the
-- household fan-out, which must never reach a sibling another agent holds.
--
-- WHY `assigned_to_user_id = dequeued_by_id` IS THE RIGHT WIDENING. Every
-- writer that puts a row into 'assigned' stamps the claiming user in the same
-- UPDATE — claim_next_queue_contact (20260803130000),
-- select_and_update_campaign_contacts (20260807130000), and
-- claim_queue_entry_for_dial (20260805120000) — and every writer that releases
-- a claim clears it: reset_stale_campaign_queue_claims,
-- fail_exhausted_campaign_queue_contacts, and requeue (20260814120000, #1250,
-- which is what made assigned_to_user_id trustworthy as a claim token in the
-- first place). So `assigned_to_user_id = dequeued_by_id` means precisely
-- "the caller still holds this claim": the dequeue lands for the agent who
-- owns the row and no-ops for everyone else, keeping the guard's protection
-- while removing its false negative.
--
-- A NULL dequeued_by_id (system-initiated dequeue, e.g. a status callback
-- whose conference name did not parse into a user id) matches nothing under
-- `=`, so those callers keep exactly today's behaviour rather than gaining an
-- unguarded write.
--
-- Column vocabulary is unchanged (still the full QUEUE_ENTRY_TRANSITIONS
-- `dequeued` set), so scripts/check-queue-rpc-contract.mjs is unaffected.
--
-- Closes #1260.

CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.campaign_queue
  set
    queue_state = 'dequeued',
    assigned_to_user_id = null,
    provider_status = null,
    dequeued_by = dequeued_by_id,
    dequeued_at = now(),
    dequeued_reason = dequeued_reason_text
  where contact_id = passed_contact_id
    and workspace = p_workspace
    and (
      queue_state is null
      or queue_state = 'queued'
      -- #1260: the caller's own claim. Narrower than "any assigned row" on
      -- purpose — see the header for why this is the race guard, not a hole.
      or (
        queue_state = 'assigned'
        and dequeued_by_id is not null
        and assigned_to_user_id = dequeued_by_id
      )
    );

  if group_on_household then
    update public.campaign_queue cq
    set
      queue_state = 'dequeued',
      assigned_to_user_id = null,
      provider_status = null,
      dequeued_by = dequeued_by_id,
      dequeued_at = now(),
      dequeued_reason = dequeued_reason_text
    from public.contact c1
    join public.contact c2 on c1.household_id is not null and c1.household_id = c2.household_id
    where
      c1.id = passed_contact_id
      and c1.workspace = p_workspace
      and c2.workspace = p_workspace
      and cq.contact_id = c2.id
      and cq.workspace = p_workspace
      and (
        cq.queue_state is null
        or cq.queue_state = 'queued'
        -- Same widening, same guard: a household fan-out must never dequeue
        -- a sibling row another agent is currently holding.
        or (
          cq.queue_state = 'assigned'
          and dequeued_by_id is not null
          and cq.assigned_to_user_id = dequeued_by_id
        )
      );
  end if;
end;
$function$;
