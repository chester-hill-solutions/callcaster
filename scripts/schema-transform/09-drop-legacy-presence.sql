-- Phase 1 schema transform — step 09: drop legacy presence columns
-- Target: Railway review Postgres ONLY.
--
-- PREREQUISITE: Phase 3B SSE + agent_status heartbeats wired on staging.
-- Do NOT run until useCallRoom / user.activity writes are removed from app.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'activity'
  ) THEN
    RAISE NOTICE 'user.activity column exists — drop blocked until SSE migration verified';
    -- ALTER TABLE public.user DROP COLUMN IF EXISTS activity;
  ELSE
    RAISE NOTICE 'user.activity already absent';
  END IF;
END $$;

-- workspace_users table replaced by workspace membership queries + agent_status
-- DROP TABLE IF EXISTS public.workspace_users CASCADE;

-- workspace.users text[] column (legacy denormalized list)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace'
      AND column_name = 'users'
  ) THEN
    RAISE NOTICE 'workspace.users array exists — drop after membership path verified';
    -- ALTER TABLE public.workspace DROP COLUMN IF EXISTS users;
  END IF;
END $$;

COMMIT;
