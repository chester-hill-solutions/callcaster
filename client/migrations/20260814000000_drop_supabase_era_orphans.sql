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
--
-- Lineage tolerance (#1450): long-lived baseline-lineage databases (dev,
-- production) carry objects that still depend on some of these, and one
-- RESTRICT failure aborted the whole file on every boot, so the bootstrap
-- never recorded it and re-tried forever. Each drop runs in its own
-- sub-block: a dependency or missing-object error is downgraded to a WARNING
-- naming the statement, the rest of the file proceeds, and the file is
-- recorded. Whatever survives shows up in `npm run check:db-orphans` for a
-- targeted follow-up on that database. Fresh databases drop everything.

BEGIN;

DO $$
DECLARE
  stmt text;
BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    'DROP FUNCTION IF EXISTS public.batch_delete_contacts()',
    'DROP FUNCTION IF EXISTS public.notify_campaign_active()',
    'DROP FUNCTION IF EXISTS public.process_ivr_tasks()',
    'DROP FUNCTION IF EXISTS public.process_ivr_tasks(integer)',
    'DROP FUNCTION IF EXISTS public.process_sms_tasks(integer)',
    'DROP FUNCTION IF EXISTS public.enqueue_ivr_task(text, uuid, bigint, uuid, bigint, bigint, text, integer, integer, boolean)',
    'DROP FUNCTION IF EXISTS public.enqueue_ivr_batch(jsonb[])',
    'DROP FUNCTION IF EXISTS public.enqueue_sms_batch(jsonb[])',
    'DROP TABLE IF EXISTS public.pgmq_failed_tasks',
    'DROP TYPE IF EXISTS public.pgmq_message',
    'DROP FUNCTION IF EXISTS public.ensure_twilio_open_sync_cron_job(text)',
    'DROP FUNCTION IF EXISTS public.create_cron_job(text, text, text)',
    'DROP FUNCTION IF EXISTS public.get_active_cron_jobs()',
    'DROP FUNCTION IF EXISTS public.generate_cron_expressions(jsonb)',
    'DROP FUNCTION IF EXISTS public.get_campaign_messages_chunk(integer, uuid, integer, integer)',
    'DROP FUNCTION IF EXISTS public.get_response_version_history(uuid)',
    'DROP FUNCTION IF EXISTS public.authorize(uuid, public.workspace_permission)',
    'DROP FUNCTION IF EXISTS public.test_authorize()',
    'DROP FUNCTION IF EXISTS app_auth.is_sudo_user()',
    'DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb)',
    'DROP FUNCTION IF EXISTS public.insert_new_user()',
    'DROP FUNCTION IF EXISTS public.add_invited_caller_to_workspace()',
    'DROP FUNCTION IF EXISTS public.process_existing_contacts()',
    'DROP FUNCTION IF EXISTS public.add_contact_to_all_campaign_queues(bigint, bigint)',
    'DROP FUNCTION IF EXISTS public.fullname(public.contact)',
    'DROP FUNCTION IF EXISTS public.create_new_workspace(text)'
  ] LOOP
    BEGIN
      EXECUTE stmt;
    EXCEPTION
      WHEN dependent_objects_still_exist OR undefined_object OR undefined_function OR undefined_table THEN
        RAISE WARNING 'drop_supabase_era_orphans: skipped "%": %', stmt, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;
