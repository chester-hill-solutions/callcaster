-- Migration: Drop legacy triggers/functions with hardcoded Supabase JWT
-- Phase 0 schema remediation — these functions call an old Supabase Edge Function
-- endpoint using a hardcoded service-role JWT and are no longer used.

BEGIN;

-- Drop triggers first (they depend on the functions).
drop trigger if exists add_contact_to_queues_trigger on public.contact_audience;
drop trigger if exists campaign_is_active_change_trigger on public.campaign;
drop trigger if exists campaign_schedule_change_trigger on public.campaign;
drop trigger if exists outreach_trigger on public.outreach_attempt;
drop trigger if exists transaction_history_update_credits on public.transaction_history;
drop trigger if exists trigger_inherit_parent_call_data on public.call;

-- Drop the legacy functions.
drop function if exists public.call_edge_function();
drop function if exists public.call_outreach_webhook();
drop function if exists public.campaign_is_active_change();
drop function if exists public.inherit_parent_call_data();
drop function if exists public.notify_schedule_change();
drop function if exists public.transaction_history_update_credits();
drop function if exists public.trigger_add_contact_to_queues();

COMMIT;
