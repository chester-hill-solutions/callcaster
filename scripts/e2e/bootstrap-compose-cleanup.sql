-- E2E compose: drop legacy Supabase triggers/functions that call net.http_post.
-- Baseline dump (0000) still includes these; production applies 20260704000005 separately.

BEGIN;

DROP TRIGGER IF EXISTS add_contact_to_queues_trigger ON public.contact_audience;
DROP TRIGGER IF EXISTS campaign_is_active_change_trigger ON public.campaign;
DROP TRIGGER IF EXISTS campaign_schedule_change_trigger ON public.campaign;
DROP TRIGGER IF EXISTS outreach_trigger ON public.outreach_attempt;
DROP TRIGGER IF EXISTS transaction_history_update_credits ON public.transaction_history;
DROP TRIGGER IF EXISTS trigger_inherit_parent_call_data ON public.call;

DROP FUNCTION IF EXISTS public.call_edge_function();
DROP FUNCTION IF EXISTS public.call_outreach_webhook();
DROP FUNCTION IF EXISTS public.campaign_is_active_change();
DROP FUNCTION IF EXISTS public.inherit_parent_call_data();
DROP FUNCTION IF EXISTS public.notify_schedule_change();
DROP FUNCTION IF EXISTS public.transaction_history_update_credits();
DROP FUNCTION IF EXISTS public.trigger_add_contact_to_queues();

COMMIT;
