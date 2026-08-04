-- Phase B: backfill CHS workspace_member + feature permission matrix from legacy workspace_users.
-- Prerequisites: drizzle/0008 / client/migrations/20260713180000 applied (CHS tables + product roles).
-- Target: Railway review Postgres. Idempotent upserts. Aborts on unmapped roles.
-- Policy: field_director → admin (docs/remediation/wave1-membership-migration-2026-07-13.md §3).

\echo '=== Preflight: CHS membership tables exist ==='
SELECT to_regclass('public.workspace_member') AS workspace_member,
       to_regclass('public.workspace_role') AS workspace_role,
       to_regclass('public.workspace_feature') AS workspace_feature,
       to_regclass('public.workspace_feature_permission') AS workspace_feature_permission;

DO $$
BEGIN
  IF to_regclass('public.workspace_member') IS NULL
     OR to_regclass('public.workspace_role') IS NULL THEN
    RAISE EXCEPTION 'CHS membership tables missing — apply 0008_chs_workspace_membership first';
  END IF;
END $$;

\echo '=== Preflight: abort on unmapped workspace_users.role ==='
DO $$
DECLARE
  bad_count bigint;
  sample text;
BEGIN
  SELECT count(*), string_agg(DISTINCT role::text, ', ')
    INTO bad_count, sample
  FROM public.workspace_users
  WHERE role::text NOT IN ('owner', 'admin', 'member', 'caller', 'field_director');

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Unmapped workspace_users.role values (%): %. Map or fix before cutover.',
      bad_count, sample;
  END IF;
END $$;

\echo '=== Ensure product roles exist ==='
INSERT INTO public.workspace_role ("id", "name", "workspace_id", "rank")
VALUES
  ('caller', 'caller', NULL, 0),
  ('member', 'member', NULL, 1),
  ('admin', 'admin', NULL, 2),
  ('owner', 'owner', NULL, 3)
ON CONFLICT ("id") DO NOTHING;

\echo '=== Seed CallCaster product features (SEC-07 matrix) ==='
INSERT INTO public.workspace_feature ("id", "name", "description", "workspace_id")
VALUES
  ('campaigns.read', 'campaigns.read', 'Read campaigns and queue state', NULL),
  ('campaigns.write', 'campaigns.write', 'Create and update campaigns', NULL),
  ('campaigns.dispatch', 'campaigns.dispatch', 'Activate automated campaign dispatch', NULL),
  ('calls.start', 'calls.start', 'Start dialer conferences and outbound call sessions', NULL),
  ('calls.control', 'calls.control', 'Control live calls (disconnect, hold, transfer)', NULL),
  ('messages.send', 'messages.send', 'Send SMS and chat messages', NULL),
  ('members.invite', 'members.invite', 'Invite and manage workspace members', NULL),
  ('audit.read', 'audit.read', 'Read workspace audit events', NULL)
ON CONFLICT ("id") DO NOTHING;

\echo '=== Seed role→feature allow permissions (CALLCASTER_ROLE_CAPABILITY_MATRIX) ==='
-- owner: all
INSERT INTO public.workspace_feature_permission ("id", "workspace_id", "role_id", "feature_id", "allowed")
SELECT
  'owner:' || f.id,
  NULL,
  'owner',
  f.id,
  true
FROM public.workspace_feature f
WHERE f.workspace_id IS NULL
ON CONFLICT ("id") DO NOTHING;

-- admin: all except audit.read
INSERT INTO public.workspace_feature_permission ("id", "workspace_id", "role_id", "feature_id", "allowed")
VALUES
  ('admin:campaigns.read', NULL, 'admin', 'campaigns.read', true),
  ('admin:campaigns.write', NULL, 'admin', 'campaigns.write', true),
  ('admin:campaigns.dispatch', NULL, 'admin', 'campaigns.dispatch', true),
  ('admin:calls.start', NULL, 'admin', 'calls.start', true),
  ('admin:calls.control', NULL, 'admin', 'calls.control', true),
  ('admin:messages.send', NULL, 'admin', 'messages.send', true),
  ('admin:members.invite', NULL, 'admin', 'members.invite', true)
ON CONFLICT ("id") DO NOTHING;

-- member
INSERT INTO public.workspace_feature_permission ("id", "workspace_id", "role_id", "feature_id", "allowed")
VALUES
  ('member:campaigns.read', NULL, 'member', 'campaigns.read', true),
  ('member:campaigns.write', NULL, 'member', 'campaigns.write', true),
  ('member:calls.start', NULL, 'member', 'calls.start', true),
  ('member:calls.control', NULL, 'member', 'calls.control', true),
  ('member:messages.send', NULL, 'member', 'messages.send', true)
ON CONFLICT ("id") DO NOTHING;

-- caller
INSERT INTO public.workspace_feature_permission ("id", "workspace_id", "role_id", "feature_id", "allowed")
VALUES
  ('caller:campaigns.read', NULL, 'caller', 'campaigns.read', true),
  ('caller:calls.start', NULL, 'caller', 'calls.start', true),
  ('caller:calls.control', NULL, 'caller', 'calls.control', true)
ON CONFLICT ("id") DO NOTHING;

\echo '=== Backfill workspace_member from workspace_users ==='
INSERT INTO public.workspace_member (
  "id",
  "workspace_id",
  "user_id",
  "role_id",
  "invited_by",
  "created_at"
)
SELECT
  'wm:' || wu.workspace_id::text || ':' || wu.user_id::text AS id,
  wu.workspace_id::text,
  wu.user_id::text,
  CASE wu.role::text
    WHEN 'owner' THEN 'owner'
    WHEN 'admin' THEN 'admin'
    WHEN 'member' THEN 'member'
    WHEN 'caller' THEN 'caller'
    WHEN 'field_director' THEN 'admin'
  END AS role_id,
  NULL,
  now()
FROM public.workspace_users wu
ON CONFLICT ("id") DO UPDATE SET
  role_id = EXCLUDED.role_id,
  workspace_id = EXCLUDED.workspace_id,
  user_id = EXCLUDED.user_id;

\echo '=== Backfill summary ==='
SELECT role_id, count(*)::bigint AS members
FROM public.workspace_member
GROUP BY 1
ORDER BY 1;

SELECT
  (SELECT count(*) FROM public.workspace_users) AS legacy_rows,
  (SELECT count(*) FROM public.workspace_member) AS chs_rows;
