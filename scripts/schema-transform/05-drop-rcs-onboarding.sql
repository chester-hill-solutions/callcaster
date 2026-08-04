-- Phase 1 schema transform — step 05: RCS onboarding cleanup
-- Target: Railway review Postgres ONLY.
--
-- RCS state lives inside workspace.twilio_data JSON (messaging onboarding), not
-- dedicated columns. This step is a no-op at DDL level unless future migrations
-- added RCS-specific tables (none in app/db/schema.ts as of 2026-06-29).
--
-- Companion app work (Phase 6 / parallel):
--   - Delete app/lib/rcs-onboarding.server.ts callers
--   - Strip "rcs" from messaging onboarding normalize paths
--   - RCS_ONBOARDING_ENABLED remains false

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rcs_sender'
  ) THEN
    RAISE NOTICE 'Unexpected rcs_sender table found — drop manually after verifying no FKs';
  ELSE
    RAISE NOTICE 'No RCS-specific tables — JSON cleanup is app-layer only';
  END IF;
END $$;

-- Optional: strip rcs keys from twilio_data JSON on review (run only after backup)
-- UPDATE public.workspace
-- SET twilio_data = twilio_data::jsonb - 'rcs'
-- WHERE twilio_data::jsonb ? 'rcs';

COMMIT;
