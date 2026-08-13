-- Migration: Drop Supabase-era orphaned DB objects (#1229)
--
-- The baseline dump carries ~45 functions with zero app callers that survive
-- replay onto every fresh database. None are load-bearing; several are
-- dangerous. This drops the dangerous tier and the dead-and-stale tier found
-- by the 2026-08-13 legacy sweep. Unreachable-but-working reporting RPCs
-- (get_basic_results etc.) are deliberately NOT dropped here — they need a
-- keep/drop decision and are tracked in #1229.
--
-- Nothing here has a caller in app/, worker/, services/, or scripts/, and no
-- surviving SQL references any of it. The db-health BANNED_FUNCTIONS sentinel
-- list is intentionally NOT extended: these objects exist on healthy v2
-- databases until this migration runs, so they cannot distinguish a legacy
-- database from an unmigrated one; recurrence is guarded by check:db-orphans.

BEGIN;

-- ── Dangerous ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER hard-delete of every contact in one hardcoded workspace
-- id, executable by PUBLIC. The single worst survivor.
DROP FUNCTION IF EXISTS public.batch_delete_contacts();

-- Orphaned twin of the dropped campaign_is_active_change(): same dead
-- Supabase edge-function URL and rotated service-role key literal. The
-- 20260704000005 pass caught the trigger-attached copy and missed this one.
DROP FUNCTION IF EXISTS public.notify_campaign_active();

-- pgmq/pg_net edge-dispatch family: posts to dead /functions/v1 endpoints
-- with hardcoded key literals. Non-functional on v2 (no pgmq/pg_net
-- extensions) but shipped into every fresh database.
DROP FUNCTION IF EXISTS public.process_ivr_tasks();
DROP FUNCTION IF EXISTS public.process_ivr_tasks(integer);
DROP FUNCTION IF EXISTS public.process_sms_tasks(integer);
DROP FUNCTION IF EXISTS public.enqueue_ivr_task(text, uuid, bigint, uuid, bigint, bigint, text, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.enqueue_ivr_batch(jsonb[]);
DROP FUNCTION IF EXISTS public.enqueue_sms_batch(jsonb[]);
DROP TABLE IF EXISTS public.pgmq_failed_tasks;
DROP TYPE IF EXISTS public.pgmq_message;

-- pg_cron family: job scheduling moved to the job table (ADR-0007).
-- ensure_twilio_open_sync_cron_job could re-schedule the retired cron job
-- against a hardcoded legacy edge endpoint; 20260714130000 unscheduled the
-- job but left the function that recreates it.
DROP FUNCTION IF EXISTS public.ensure_twilio_open_sync_cron_job(text);
DROP FUNCTION IF EXISTS public.create_cron_job(text, text, text);
DROP FUNCTION IF EXISTS public.get_active_cron_jobs();
DROP FUNCTION IF EXISTS public.generate_cron_expressions(jsonb);

-- ── Dead and stale (reference dropped columns/tables or Supabase auth) ─────

-- Selects contact.address_id/carrier, both dropped by the contact prune; the
-- live twin get_campaign_messages was patched in 20260722110000, this chunk
-- variant was left stale.
DROP FUNCTION IF EXISTS public.get_campaign_messages_chunk(integer, uuid, integer, integer);

-- Queries a `responses` table that has never existed in this schema.
DROP FUNCTION IF EXISTS public.get_response_version_history(uuid);

-- Supabase RLS helpers: read auth.jwt() (does not exist) and join
-- workspace_permissions (no such table). RLS itself was dropped in
-- 20260715140000.
DROP FUNCTION IF EXISTS public.authorize(uuid, public.workspace_permission);
DROP FUNCTION IF EXISTS public.test_authorize();
DROP FUNCTION IF EXISTS app_auth.is_sudo_user();

-- GoTrue-era auth hooks: Better Auth replaced them; the auth.users table
-- they trigger on does not exist. add_invited_caller_to_workspace also took
-- its role straight from user-controlled signup metadata.
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS public.insert_new_user();
DROP FUNCTION IF EXISTS public.add_invited_caller_to_workspace();

-- Orphaned when add_contact_to_queues_trigger was dropped.
DROP FUNCTION IF EXISTS public.process_existing_contacts();
DROP FUNCTION IF EXISTS public.add_contact_to_all_campaign_queues(bigint, bigint);

-- PostgREST computed-column helper (Supabase-era `select=fullname` on the
-- contact resource). v2 renders names in the app layer.
DROP FUNCTION IF EXISTS public.fullname(public.contact);

-- 1-arg overload writes auth.uid() (NULL outside the shim's transaction
-- scope) as the owner. The app only ever calls the 2-arg form, which stays.
DROP FUNCTION IF EXISTS public.create_new_workspace(text);

COMMIT;
