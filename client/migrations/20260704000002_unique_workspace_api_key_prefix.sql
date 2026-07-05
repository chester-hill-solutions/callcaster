-- Migration: Add unique index on workspace_api_key.key_prefix
-- Ensures each stored API key prefix is unique, making prefix lookup deterministic.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_api_key_key_prefix_unique
  ON workspace_api_key(key_prefix);

COMMIT;
