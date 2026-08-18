-- Migration: Drop campaign.is_active — activity is derived from status (#1216)
--
-- `campaign.is_active` was a second source of lifecycle truth alongside
-- `status`, and the two drifted: the legacy credits trigger zeroed is_active
-- without touching status, and try_complete_campaign_if_drained refused to
-- complete a drained campaign unless is_active happened to be true. All app
-- readers/writers now use `status` (running/waiting = active); the public API
-- serializes a derived `is_active` for compatibility and ignores it on writes.
--
-- Survey.is_active is a different column on a different table and is untouched.

BEGIN;

-- 1) try_complete_campaign_if_drained: gate completion on status, not on the
-- doomed column. Old body required `is_active = true`, so any running
-- campaign whose is_active had drifted false could never complete.
CREATE OR REPLACE FUNCTION public.try_complete_campaign_if_drained(campaign_id_pro integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  pending boolean;
begin
  select public.campaign_queue_has_pending_work(campaign_id_pro)
  into pending;

  if pending then
    return false;
  end if;

  update public.campaign
  set status = 'complete'
  where id = campaign_id_pro
    and status in ('running', 'waiting');

  return true;
end;
$function$;

-- 2) reset_campaign: same body as 20260722120000, minus the is_active write.
CREATE OR REPLACE FUNCTION public.reset_campaign(campaign_id_prop integer)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
    UPDATE campaign
    SET status = 'paused'
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

-- 3) update_workspace_credits: orphaned Supabase-era function (its trigger,
-- transaction_history_update_credits, was dropped in 20260704000005). It set
-- campaign.is_active = false on credit depletion without changing status —
-- exactly the drift this migration removes. The v2 credit gate lives in the
-- dispatch path (hasInsufficientCreditsForOutbound), not in a trigger.
DROP FUNCTION IF EXISTS public.update_workspace_credits();

-- 4) Drop the column.
ALTER TABLE public.campaign DROP COLUMN IF EXISTS is_active;

COMMIT;
