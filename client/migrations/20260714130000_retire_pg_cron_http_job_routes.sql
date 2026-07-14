-- WS-A: Align legacy `job` table with ADR-0007 / Drizzle schema used by Bun worker.

BEGIN;

-- Drop indexes that cast status/type to legacy enums (block ALTER TYPE).
DROP INDEX IF EXISTS idx_job_status_claimed;
DROP INDEX IF EXISTS idx_job_workspace_status;
DROP INDEX IF EXISTS idx_job_type_idempotency_key;
DROP INDEX IF EXISTS job_claimable_idx;

ALTER TABLE job ALTER COLUMN status DROP DEFAULT;
ALTER TABLE job
  ALTER COLUMN type TYPE text USING type::text;
ALTER TABLE job
  ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE job ALTER COLUMN status SET DEFAULT 'queued';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'workspace'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE job RENAME COLUMN workspace TO workspace_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'workspace'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'workspace_id'
  ) THEN
    UPDATE job SET workspace_id = workspace WHERE workspace_id IS NULL AND workspace IS NOT NULL;
  END IF;
END $$;

ALTER TABLE job
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE job SET status = 'queued' WHERE status IN ('pending', 'claimed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_type_idempotency_key
  ON job (type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_claimable_idx
  ON job (status, created_at, claimed_until)
  WHERE status IN ('pending', 'claimed', 'queued', 'running');

CREATE INDEX IF NOT EXISTS idx_job_workspace_status
  ON job (workspace_id, status, created_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n
    JOIN pg_class c ON c.relnamespace = n.oid
    WHERE n.nspname = 'cron' AND c.relname = 'job'
  ) THEN
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname IN (
      'twilio_open_sync_every_5m',
      'number_rental_billing_daily',
      'twilio_billing_reconcile_daily',
      'low_credit_notify_daily'
    );
  END IF;
END $$;

INSERT INTO job (type, status, params)
SELECT 'twilio_open_sync', 'queued', jsonb_build_object('callLimit', 50, 'messageLimit', 50, 'maxAgeMinutes', 120)
WHERE NOT EXISTS (
  SELECT 1 FROM job WHERE type = 'twilio_open_sync' AND status IN ('queued', 'running')
);

INSERT INTO job (type, status, params)
SELECT 'billing_reconcile', 'queued', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM job WHERE type = 'billing_reconcile' AND status IN ('queued', 'running')
);

INSERT INTO job (type, status, params)
SELECT 'number_rental_billing', 'queued', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM job WHERE type = 'number_rental_billing' AND status IN ('queued', 'running')
);

COMMIT;
