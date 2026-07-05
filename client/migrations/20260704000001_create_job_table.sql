-- Migration: Create job table for Bun worker queue
-- Part of Phase 3C - Generalized job table and Bun worker (ADR-0007)

BEGIN;

CREATE TYPE job_status AS ENUM (
  'pending',
  'claimed',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE job_type AS ENUM (
  'export',
  'audience_upload',
  'billing_reconcile',
  'twilio_open_sync',
  'number_rental_billing',
  'campaign_dispatch',
  'queue_next',
  'workspace_twilio_sync'
);

CREATE TABLE job (
  id SERIAL PRIMARY KEY,
  type job_type NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'pending',
  progress INTEGER CHECK (progress >= 0 AND progress <= 100),
  claimed_until TIMESTAMPTZ,
  claimed_by TEXT,
  idempotency_key TEXT,
  result JSONB,
  error_message TEXT,
  workspace UUID, -- nullable for global jobs
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Unique index on (type, idempotency_key) for idempotent job creation
CREATE UNIQUE INDEX idx_job_type_idempotency_key 
  ON job(type, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Index for worker claim queries
CREATE INDEX idx_job_status_claimed 
  ON job(status, claimed_until, type) 
  WHERE status IN ('pending', 'claimed', 'running');

-- Index for workspace-scoped job queries
CREATE INDEX idx_job_workspace_status 
  ON job(workspace, status, created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_job_updated_at
  BEFORE UPDATE ON job
  FOR EACH ROW
  EXECUTE FUNCTION update_job_updated_at();

COMMIT;
