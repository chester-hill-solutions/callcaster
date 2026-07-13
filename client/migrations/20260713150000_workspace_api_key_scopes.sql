-- SEC-07: API-key capability allowlists + mandatory expiry.
-- Existing keys get empty scopes (deny-all for newly gated capabilities).
ALTER TABLE public.workspace_api_key
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.workspace_api_key
  ADD COLUMN IF NOT EXISTS expires_at text;

COMMENT ON COLUMN public.workspace_api_key.scopes IS
  'Allowlist of ProductCapabilityId values; empty = deny-all for capability-gated routes';

COMMENT ON COLUMN public.workspace_api_key.expires_at IS
  'ISO-8601 expiry; null means no expiry (legacy keys only — new keys always set this)';
