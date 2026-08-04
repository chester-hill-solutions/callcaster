-- Phase 1 — step 01c: drop vestigial audience membership trigger (audience_rule dropped in 01)
-- Target: Railway review ONLY.

BEGIN;

DROP TRIGGER IF EXISTS contact_change ON public.contact;
DROP FUNCTION IF EXISTS public.process_audience_membership_changes() CASCADE;

COMMIT;
