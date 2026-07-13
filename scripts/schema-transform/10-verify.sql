-- Phase 1 schema transform — step 10: post-transform verification
-- Target: Railway review Postgres ONLY.
-- Read-only checks — safe to run anytime; tolerates pre/post transform state.

\echo '=== Vestigial tables (empty = good after step 01) ==='
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'email', 'email_campaign', 'audience_rule', 'campaign_schedule_jobs',
    'twilio_cancellation_queue', 'workspace_permissions', 'phone_verification'
  )
ORDER BY 1;

\echo '=== Row counts (core entities) ==='
SELECT 'workspace' AS entity, count(*)::bigint FROM public.workspace
UNION ALL SELECT 'campaign', count(*)::bigint FROM public.campaign
UNION ALL SELECT 'contact', count(*)::bigint FROM public.contact
UNION ALL SELECT 'campaign_queue', count(*)::bigint FROM public.campaign_queue
UNION ALL SELECT 'call', count(*)::bigint FROM public.call
UNION ALL SELECT 'message', count(*)::bigint FROM public.message;

\echo '=== households table (after ADR-0021 / step 08) ==='
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'households'
) AS households_table_exists;

\echo '=== campaign_queue.status (absent after step 03) ==='
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'campaign_queue'
  AND column_name = 'status';

\echo '=== Orphan campaign_queue rows ==='
SELECT count(*) AS orphan_queue_rows
FROM public.campaign_queue cq
LEFT JOIN public.campaign c ON c.id = cq.campaign_id
WHERE cq.campaign_id IS NOT NULL AND c.id IS NULL;

\echo '=== Subtype campaign tables (absent after step 02) ==='
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('live_campaign', 'ivr_campaign', 'message_campaign')
ORDER BY 1;

\echo '=== contact pruned columns (absent after step 04) ==='
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contact'
  AND column_name IN ('fullname', 'carrier', 'address_id')
ORDER BY 1;

\echo '=== twilio_sid columns (present after step 06) ==='
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('call', 'message')
  AND column_name = 'twilio_sid'
ORDER BY 1;

\echo '=== CHS membership tables (after Wave 1 DDL 0008) ==='
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'workspace_member',
    'workspace_role',
    'workspace_feature',
    'workspace_feature_permission',
    'workspace_invitation'
  )
ORDER BY 1;

\echo '=== CHS product roles (expect owner/admin/member/caller) ==='
SELECT id, rank
FROM public.workspace_role
WHERE workspace_id IS NULL
ORDER BY rank;

\echo '=== Membership parity (legacy vs CHS; after step 11) ==='
SELECT
  (SELECT count(*)::bigint FROM public.workspace_users) AS legacy_workspace_users,
  (SELECT count(*)::bigint FROM public.workspace_member) AS chs_workspace_member;

\echo '=== Role histogram (workspace_member) ==='
SELECT role_id, count(*)::bigint
FROM public.workspace_member
GROUP BY 1
ORDER BY 1;

\echo '=== Workspaces missing an owner member (should be 0 after backfill) ==='
SELECT w.id::text AS workspace_id
FROM public.workspace w
LEFT JOIN public.workspace_member m
  ON m.workspace_id = w.id::text AND m.role_id = 'owner'
WHERE m.id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.workspace_id::text = w.id::text
  )
LIMIT 50;

\echo '=== Unknown role_id rows (should be 0) ==='
SELECT count(*)::bigint AS unknown_role_members
FROM public.workspace_member
WHERE role_id NOT IN ('owner', 'admin', 'member', 'caller');
