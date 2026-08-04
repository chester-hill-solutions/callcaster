-- Phase 1 schema transform — step 01: drop vestigial tables
-- Target: Railway review Postgres ONLY.
-- Idempotent: DROP … IF EXISTS throughout.
--
-- FK / dependency order (children before parents):
--   1. email_campaign  → references email(id), campaign(id)
--   2. email           → parent of email_campaign.email_id
--   3. audience_rule   → references audience(id)
--   4. campaign_schedule_jobs → references campaign(id) only
--   5. twilio_cancellation_queue, workspace_permissions, phone_verification — no inbound FKs
--
-- KEPT per migration plan (do NOT drop here):
--   verification_session, user.verified_audio_numbers (call-in caller ID flow)

BEGIN;

-- ─── 1. email_campaign (child of email + campaign) ──────────────────────────

DROP TABLE IF EXISTS public.email_campaign CASCADE;

-- ─── 2. email templates ─────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.email CASCADE;

-- ─── 3. audience_rule (conditional audience builder — unused) ───────────────

DROP TABLE IF EXISTS public.audience_rule CASCADE;

-- ─── 4. campaign_schedule_jobs (pg_cron schedule metadata — replaced by worker) ─

DROP TABLE IF EXISTS public.campaign_schedule_jobs CASCADE;

-- ─── 5. twilio_cancellation_queue (cancel_calls Edge fn — replaced by worker) ─

DROP TABLE IF EXISTS public.twilio_cancellation_queue CASCADE;

-- ─── 6. workspace_permissions (static role matrix — app uses workspace_role enum) ─

DROP TABLE IF EXISTS public.workspace_permissions CASCADE;

-- ─── 7. phone_verification (PIN flow retired; call-in uses verification_session) ─

DROP TABLE IF EXISTS public.phone_verification CASCADE;

-- ─── 8. campaign_type enum: remove `email` variant ──────────────────────────
-- Requires PostgreSQL 16+ (Railway PG 18). Re-run safe via IF EXISTS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'campaign_type' AND e.enumlabel = 'email'
  ) THEN
    EXECUTE 'ALTER TYPE public.campaign_type DROP VALUE ''email''';
    RAISE NOTICE 'Dropped campaign_type value: email';
  ELSE
    RAISE NOTICE 'campaign_type.email already absent — skip';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'campaign_type enum not found — campaign.type may be plain text only';
  WHEN OTHERS THEN
    -- Fallback for PG < 16 or text column: document manual enum rebuild in squashed baseline.
    RAISE WARNING 'Could not DROP campaign_type email value: % — handle in 0000_baseline.sql', SQLERRM;
END $$;

-- ─── Post-drop sanity (non-fatal) ───────────────────────────────────────────

DO $$
DECLARE
  vestigial text[] := ARRAY[
    'email', 'email_campaign', 'audience_rule', 'campaign_schedule_jobs',
    'twilio_cancellation_queue', 'workspace_permissions', 'phone_verification'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY vestigial LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE WARNING 'Table public.% still exists after drop step', tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;
