-- SEC-07 forward mirror of client/migrations/20260713150000_workspace_api_key_scopes.sql
ALTER TABLE public.workspace_api_key
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.workspace_api_key
  ADD COLUMN IF NOT EXISTS expires_at text;
