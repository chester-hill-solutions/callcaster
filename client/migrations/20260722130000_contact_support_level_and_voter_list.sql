-- Contact columns referenced by Drizzle (ADR-0019 support_level, ADR-0023 voter list)
-- that lived only in drizzle/0006_app_schema_tail.sql and were never recorded in
-- supabase_migrations.schema_migrations on Railway review. Idempotent.

ALTER TABLE public.outreach_attempt
  ADD COLUMN IF NOT EXISTS support_level smallint
  CHECK (support_level IS NULL OR support_level BETWEEN 1 AND 5);

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS support_level smallint
  CHECK (support_level IS NULL OR support_level BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS contact_support_level_idx
  ON public.contact (support_level)
  WHERE support_level IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE public.voter_list_source AS ENUM (
    'liberalist',
    'van',
    'elections_canada',
    'elections_ontario',
    'manual',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_source public.voter_list_source;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_imported_at timestamptz;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_list_expires_at timestamptz;

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS voter_id text;

CREATE INDEX IF NOT EXISTS contact_voter_list_expires_at_idx
  ON public.contact (voter_list_expires_at)
  WHERE voter_list_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_voter_id_idx
  ON public.contact (voter_id)
  WHERE voter_id IS NOT NULL;
