-- Migration: gate message-campaign completion on settled messages (#2048)
--
-- Problem, measured in production on the Eric Lombardi blast (2026-09-24):
--
--   Our database recorded the last send request at 6:29pm EDT and the
--   campaign reported 'complete'. Twilio's own message log shows 5,382 of
--   those messages were still held inside the provider and were released to
--   carriers between 11:59pm and 1:46am EDT — a median lag of 7.3 hours and
--   up to 7.7 hours. Every 30002 ('not delivered to carrier') failure in the
--   whole campaign fell in that overnight block.
--
--   try_complete_campaign_if_drained gated on the local queue and on unsettled
--   CALLS. It never looked at message rows, so a message campaign flipped to
--   'complete' the moment the last queue row was dequeued — and a dequeue means
--   "handed to Twilio", not "settled by the carrier".
--
-- The gate now also requires no unsettled message rows for the campaign.
--
-- The settled set mirrors SETTLED_SMS_STATUSES in app/lib/sms-status.ts:
--
--     delivered, read, canceled, failed, undelivered
--
-- It is deliberately NOT TERMINAL_BILLABLE_SMS_STATUSES. `read` and `canceled`
-- are real terminal provider states that never debit a second time, so gating on
-- the billing set would leave a campaign running forever whenever a message
-- settles to `canceled` (STOP cancellation, campaign end-date cancellation).
--
-- `sent` is deliberately excluded: it is the intermediate step between `sending`
-- and `delivered`. A NULL status is unsettled for the same reason the call gate
-- treats NULL call status as unsettled — the intent row exists but the provider
-- has not reported a state yet.
--
-- The parity test (test/campaign-completion-rpc-contract.test.ts) keeps the SQL
-- list and the TypeScript list in step, and pins the check order.
--
-- Ordering note: this migration must sort AFTER
-- 20260922120000_gate_campaign_completion_on_settled_calls.sql, which is the
-- current definition of try_complete_campaign_if_drained.
--
-- The explicit `::text` casts are required: message.status is a Postgres ENUM in
-- real database lineages, and lower(<enum>) does not exist. This mirrors the
-- call-status-guard integration test that documents the failed un-cast history.

BEGIN;

-- Does this campaign still have messages the provider has not settled?
--
-- Inbound rows are excluded by campaign_id: the inbound SMS write path never
-- sets it (see #2046), so inbound replies cannot hold a campaign open. Rows for
-- a different campaign are excluded by campaign_id itself.
CREATE OR REPLACE FUNCTION public.campaign_has_unsettled_messages(campaign_id_pro integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $$
  select exists (
    select 1
    from public.message m
    where m.campaign_id = campaign_id_pro
      and coalesce(lower(m.status::text), '') not in (
        'delivered', 'read', 'canceled', 'failed', 'undelivered'
      )
  );
$$;

-- Campaigns in one workspace that the completion gate is currently refusing,
-- oldest-stranded-message first.
--
-- This exists so the unsettled-message rule is expressed in SQL exactly once.
-- A first version of the recovery sweep re-implemented the predicate in
-- Drizzle as `notInArray(status, SETTLED_SMS_STATUSES)` and shipped two bugs
-- that no test caught, both verified against real Postgres:
--
--   1. `status NOT IN (...)` evaluates to NULL when status is NULL, so a bare
--      notInArray DROPPED every NULL-status row. The gate blocks on NULL (it
--      coalesces to ''), so a campaign whose messages had no provider callback
--      was blocked forever and this sweep could never unblock it. That is
--      exactly the intent-without-callback case behind the Lombardi incident.
--   2. The row limit applied to message ROWS, not distinct campaigns, with no
--      ORDER BY. A campaign holding 23,504 unsettled rows consumed the whole
--      budget and starved every other campaign, non-deterministically.
--
-- `group by` fixes (2): the limit now counts one row per campaign, so a
-- campaign's row count cannot crowd anyone out. `order by min(date_created)`
-- fixes the non-determinism and gives the longest-stranded campaign a slot
-- every run, so the sweep always makes progress.
--
-- The settled list must stay byte-identical to campaign_has_unsettled_messages;
-- test/campaign-completion-rpc-contract.test.ts pins both against
-- SETTLED_SMS_STATUSES.
CREATE OR REPLACE FUNCTION public.campaign_ids_with_unsettled_messages(
  workspace_id_pro uuid,
  limit_pro integer default 200
)
 RETURNS TABLE (campaign_id integer)
 LANGUAGE sql
 STABLE
AS $$
  select m.campaign_id::integer as campaign_id
  from public.message m
  where m.workspace = workspace_id_pro
    and m.campaign_id is not null
    and coalesce(lower(m.status::text), '') not in (
      'delivered', 'read', 'canceled', 'failed', 'undelivered'
    )
  group by m.campaign_id
  order by min(m.date_created) asc
  -- greatest() guards the two values that would silently disable recovery:
  -- a NULL limit and a zero or negative one.
  limit greatest(1, coalesce(limit_pro, 200));
$$;

CREATE OR REPLACE FUNCTION public.try_complete_campaign_if_drained(campaign_id_pro integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  pending boolean;
  unsettled_calls boolean;
  unsettled_messages boolean;
begin
  select public.campaign_queue_has_pending_work(campaign_id_pro)
  into pending;

  if pending then
    return false;
  end if;

  select public.campaign_has_unsettled_calls(campaign_id_pro)
  into unsettled_calls;

  if unsettled_calls then
    return false;
  end if;

  select public.campaign_has_unsettled_messages(campaign_id_pro)
  into unsettled_messages;

  if unsettled_messages then
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
