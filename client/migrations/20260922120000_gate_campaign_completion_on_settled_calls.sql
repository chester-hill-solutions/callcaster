-- Migration: gate campaign completion on settled calls (#1728)
--
-- Product decision (2026-09-20): 'complete' means all calls settled, not all
-- dials attempted. Queue rows are dequeued at dial time, so the old gate
-- (queue drained only) flipped a campaign to 'complete' while its calls were
-- still ringing; the recipient then received the dial after the campaign had
-- long since reported complete.
--
-- try_complete_campaign_if_drained now requires BOTH:
--   (a) no pending queue work (unchanged), and
--   (b) no unsettled call rows for the campaign — a call row is unsettled
--       while its status is NULL (inserted before the first status callback)
--       or anything outside the terminal set. The terminal set mirrors
--       TERMINAL_CALL_STATUSES in app/lib/telephony-db.server.ts; the parity
--       test (test/campaign-completion-rpc-contract.test.ts) keeps the two in
--       step.
--
-- Note the explicit `::text` casts: call.status is a Postgres ENUM in real
-- database lineages, and lower(<enum>) does not exist (see the
-- call-status-guard integration test for the failed un-cast history).

BEGIN;

CREATE OR REPLACE FUNCTION public.campaign_has_unsettled_calls(campaign_id_pro integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $$
  select exists (
    select 1
    from public.call c
    where c.campaign_id = campaign_id_pro
      and coalesce(lower(c.status::text), '') not in (
        'completed', 'failed', 'busy', 'no-answer', 'canceled'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.try_complete_campaign_if_drained(campaign_id_pro integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  pending boolean;
  unsettled boolean;
begin
  select public.campaign_queue_has_pending_work(campaign_id_pro)
  into pending;

  if pending then
    return false;
  end if;

  select public.campaign_has_unsettled_calls(campaign_id_pro)
  into unsettled;

  if unsettled then
    return false;
  end if;

  update public.campaign
  set status = 'complete'
  where id = campaign_id_pro
    and status in ('running', 'waiting');

  return true;
end;
$function$;

COMMIT;
