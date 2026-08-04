-- Phase 1 schema transform — step 08: household_key (ADR-0021)
-- Target: Railway review Postgres ONLY.
--
-- Repair: review DB may have adr_0021 in migration ledger but no households table
-- (failed apply). Create if missing, then backfill keys.

BEGIN;

CREATE TABLE IF NOT EXISTS public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_key text NOT NULL,
  workspace_id uuid REFERENCES public.workspace(id) ON DELETE CASCADE,
  address text,
  city text,
  province text,
  postal text,
  do_not_knock boolean NOT NULL DEFAULT false,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS households_workspace_key_uniq
  ON public.households (workspace_id, household_key);

ALTER TABLE public.contact
  ADD COLUMN IF NOT EXISTS household_id uuid;

ALTER TABLE public.contact
  DROP CONSTRAINT IF EXISTS contact_household_id_fkey;

ALTER TABLE public.contact
  ADD CONSTRAINT contact_household_id_fkey
  FOREIGN KEY (household_id)
  REFERENCES public.households(id) ON DELETE SET NULL;

-- Ensure household_key is populated on households without one
UPDATE public.households h
SET household_key = 'legacy:' || h.id::text
WHERE (household_key IS NULL OR btrim(household_key) = '');

CREATE INDEX IF NOT EXISTS households_workspace_key_idx
  ON public.households (workspace_id, household_key);

COMMIT;
