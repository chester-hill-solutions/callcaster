-- ADR-0007: generalized job table for Bun worker (cron + long-run work)

CREATE TABLE IF NOT EXISTS job (
  id serial PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  workspace_id uuid REFERENCES workspace(id),
  user_id uuid,
  idempotency_key text,
  error text,
  error_message text,
  result jsonb,
  claimed_by text,
  claimed_until timestamptz,
  attempt_count integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  retry_at timestamptz,
  progress integer,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  dead_letter_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_idempotency_key_unique
  ON job (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_status_created_at_idx
  ON job (status, created_at);
