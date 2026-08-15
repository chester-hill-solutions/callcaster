-- dequeue_contact returns how many PRIMARY rows it actually dequeued.
--
-- #1278. The predicate 20260815120000 (#1260) settled on is
-- `queue_state is null or 'queued', or 'assigned' with
-- assigned_to_user_id = dequeued_by_id` — deliberately a no-op for a caller
-- who does not hold the claim. That is right for the agent paths (a stale
-- dequeue must never kill another agent's live call), but the manual queue-UI
-- dequeue (POST /api/queues → dequeueQueueEntry → this function) had no way to
-- tell the difference: a supervisor dequeuing a contact another agent holds
-- got `{ success: true }` while the row sat there untouched. The predicate is
-- the guard, not the defect; the defect is that the guard was silent.
--
-- So: same predicate, same household fan-out, same column writes — the
-- function now just reports the row count of its PRIMARY update via
-- GET DIAGNOSTICS. 0 means "nothing was dequeued for the contact you named",
-- which the caller can surface instead of claiming success.
--
-- Why the primary count only, not the household total. The callers that care
-- asked about ONE contact; a fan-out that reaches three siblings but misses
-- the contact the agent clicked is still a failed dequeue, and summing the two
-- updates would hide exactly that. The fan-out's own partial no-ops are the
-- guard working as designed (a sibling another agent holds must be skipped)
-- and are not an error at any call site.
--
-- WHY DROP + CREATE. `CREATE OR REPLACE FUNCTION` cannot change a function's
-- return type — `RETURNS void` → `RETURNS integer` raises
-- `cannot change return type of existing function`. The DROP must name the
-- exact argument signature, and the two historical signatures are dropped
-- alongside it: leaving an orphaned overload behind is a failure mode this
-- repo has already paid for (see 20260722120000, items 2–4 — an unnoticed
-- extra overload made `campaign_queue_has_pending_work(integer)` calls throw
-- `function ... is not unique`). After this migration exactly one
-- dequeue_contact exists:
--
--   (integer, boolean, uuid, text)         baseline; dropped by 20260716140000
--   (bigint,  boolean, uuid, text)         dropped by 20260807120000
--   (bigint,  boolean, uuid, uuid, text)   the live one, recreated here
--
-- All three DROPs are `IF EXISTS`, so replaying this on a database where the
-- earlier migrations already ran is a no-op for the first two.
--
-- No SQL-side caller is affected: no plpgsql function in the lineage calls
-- dequeue_contact (verified by grep for `perform`/`select dequeue_contact`),
-- so nothing depends on its `void` return. The application calls it through
-- rpcDequeueContact (app/lib/db-rpc.server.ts), which reads the scalar.
--
-- Column vocabulary is unchanged (still the full QUEUE_ENTRY_TRANSITIONS
-- `dequeued` set), so scripts/check-queue-rpc-contract.mjs is unaffected.
--
-- Closes #1278.

DROP FUNCTION IF EXISTS public.dequeue_contact(integer, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.dequeue_contact(bigint, boolean, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.dequeue_contact(
  passed_contact_id bigint,
  group_on_household boolean,
  p_workspace uuid,
  dequeued_by_id uuid DEFAULT NULL::uuid,
  dequeued_reason_text text DEFAULT NULL::text
)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  primary_rows integer;
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
      -- purpose — see 20260815120000 for why this is the race guard, not a
      -- hole. #1278 reports when it holds instead of hiding it.
      or (
        queue_state = 'assigned'
        and dequeued_by_id is not null
        and assigned_to_user_id = dequeued_by_id
      )
    );

  get diagnostics primary_rows = row_count;

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

  return primary_rows;
end;
$function$;
