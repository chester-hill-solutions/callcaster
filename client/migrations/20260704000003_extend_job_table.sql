-- Migration: Extend job table with worker-ready columns (ADR-0007)
-- Phase 0 schema remediation — keep the Drizzle job schema as canonical.

BEGIN;

ALTER TABLE job
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS progress integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text;

-- Index for worker claim queries (status filter + age ordering)
CREATE INDEX IF NOT EXISTS job_claimable_idx
  ON job (status, created_at, claimed_until)
  WHERE status IN ('pending', 'claimed', 'queued', 'running');

COMMIT;
