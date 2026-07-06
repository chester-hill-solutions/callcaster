-- Better Auth two-factor plugin (TOTP + backup codes)

ALTER TABLE auth_user
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS auth_two_factor (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  secret text NOT NULL,
  backup_codes text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  failed_verification_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_two_factor_user_id_idx ON auth_two_factor (user_id);
