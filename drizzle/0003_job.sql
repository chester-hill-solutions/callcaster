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
  result jsonb,
  claimed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_idempotency_key_unique
  ON job (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_status_created_at_idx
  ON job (status, created_at);
