-- Phase 1 schema transform — step 07: split workspace.twilio_data
-- Target: Railway review Postgres ONLY.
-- SKETCH — typed tables replace JSON blob per migration plan.
--
-- Target tables (create if not exist):
--   workspace_twilio_config   — subaccount SID, auth token ref, messaging service SIDs
--   workspace_onboarding      — A2P / brand / emergency voice progress
--   workspace_sync_snapshot   — last open-sync payload hash + timestamp

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_twilio_config (
  workspace_id uuid PRIMARY KEY,
  subaccount_sid text,
  subaccount_auth_token_encrypted text,
  messaging_service_sid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_onboarding (
  workspace_id uuid PRIMARY KEY,
  channel text NOT NULL DEFAULT 'sms',
  status jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_sync_snapshot (
  workspace_id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from twilio_data JSON (COMMENTED — inspect JSON shape on review first)
--
-- INSERT INTO public.workspace_twilio_config (workspace_id, subaccount_sid, ...)
-- SELECT w.id::uuid, (w.twilio_data::jsonb->>'subaccountSid'), ...
-- FROM public.workspace w
-- ON CONFLICT (workspace_id) DO NOTHING;

-- After app reads typed tables exclusively:
-- ALTER TABLE public.workspace DROP COLUMN IF EXISTS twilio_data;

COMMIT;
