-- Phase 1 schema transform — step 03: normalize campaign_queue
-- Target: Railway review Postgres ONLY.
-- Idempotent: ADD COLUMN IF NOT EXISTS, conditional backfill, DROP COLUMN IF EXISTS.
--
-- Plan: drop campaign_queue.status; canonical columns are queue_state,
-- assigned_to_user_id, provider_status (+ existing dequeue metadata).
-- Mirrors backfill in client/migrations/20260521140000_queue_state_and_claim.sql.
--
-- Follow-up (app + RPC, not this file):
--   Rewrite get_campaign_queue, claim_campaign_queue_contacts, dequeue_contact
--   to stop reading/writing status; delete UUID_STATUS_PATTERN from app/lib/queue-status.ts

BEGIN;

-- ─── 1. Ensure normalized columns exist ─────────────────────────────────────

ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS queue_state text NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS provider_status text NULL;

-- Dequeue metadata (added in 20260415120000_add_dequeue_fields.sql)
ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS dequeued_by uuid NULL,
  ADD COLUMN IF NOT EXISTS dequeued_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dequeued_reason text NULL;

-- ─── 2. Backfill from legacy status (only where queue_state still null) ───────
-- Safe to re-run: targets rows with null queue_state only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_queue'
      AND column_name = 'status'
  ) THEN
    UPDATE public.campaign_queue
    SET
      queue_state = CASE
        WHEN dequeued_at IS NOT NULL OR status = 'dequeued' THEN 'dequeued'
        WHEN status = 'queued' THEN 'queued'
        WHEN status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'assigned'
        WHEN status IS NOT NULL AND status NOT IN ('queued', 'dequeued') THEN 'assigned'
        ELSE COALESCE(queue_state, 'queued')
      END,
      assigned_to_user_id = CASE
        WHEN status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN status::uuid
        ELSE assigned_to_user_id
      END,
      provider_status = CASE
        WHEN status IN ('queued', 'dequeued') THEN NULL
        WHEN status ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL
        WHEN status IS NOT NULL THEN status
        ELSE provider_status
      END
    WHERE queue_state IS NULL;
  ELSE
    RAISE NOTICE 'campaign_queue.status already dropped — backfill skipped';
  END IF;
END $$;

-- Default remaining null queue_state to queued (non-dequeued rows)
UPDATE public.campaign_queue
SET queue_state = 'queued'
WHERE queue_state IS NULL
  AND dequeued_at IS NULL;

UPDATE public.campaign_queue
SET queue_state = 'dequeued'
WHERE queue_state IS NULL
  AND dequeued_at IS NOT NULL;

-- ─── 3. Drop legacy status column ───────────────────────────────────────────
-- Moved to 03b-drop-queue-status.sql (run after 03a-rewrite-queue-rpcs.sql).

-- ─── 4. Optional: tighten nullability (defer until app + RPC rollout complete) ─
-- ALTER TABLE public.campaign_queue
--   ALTER COLUMN queue_state SET NOT NULL;
-- ALTER TABLE public.campaign_queue
--   ALTER COLUMN queue_state SET DEFAULT 'queued';

-- ─── 5. Post-step sanity ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_queue'
      AND column_name = 'status'
  ) THEN
    RAISE WARNING 'campaign_queue.status still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.campaign_queue
    WHERE queue_state IS NULL
  ) THEN
    RAISE WARNING 'campaign_queue rows with null queue_state remain — inspect before baseline squash';
  END IF;
END $$;

COMMIT;
