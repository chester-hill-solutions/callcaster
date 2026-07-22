-- Householding, DB layer: canonical household-key function + backfill.
--
-- The `households` table has existed since the baseline (unique index
-- households_workspace_key_uniq on (workspace_id, household_key), and
-- contact.household_id FK → households(id) ON DELETE SET NULL), and
-- dequeue_contact already groups queue entries by household_id — but nothing
-- ever populated households, so household grouping was dead code.
--
-- This migration:
--   1. Defines public.household_key_for(addr, postal) — the SQL twin of the
--      TS `householdKeyFor` in app/lib/household-key.ts. The two MUST stay in
--      lockstep; parity is enforced by test/household-key-sql-parity.test.ts.
--      Normalization: address lowercased with every run of non-[a-z0-9]
--      characters (punctuation, accents, whitespace) collapsed to a single
--      space then trimmed; postal lowercased with all non-[a-z0-9] stripped.
--      NULL unless both parts are non-empty after normalization.
--      Key = normalized_address || '|' || normalized_postal.
--   2. Backfills one households row per distinct (workspace, key) from
--      existing contacts, then points contact.household_id at it.
--
-- Idempotent: ON CONFLICT DO NOTHING on the unique key, and the UPDATE only
-- touches contacts whose household_id is still NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.household_key_for(addr text, postal text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN parts.a = '' OR parts.p = '' THEN NULL
    ELSE parts.a || '|' || parts.p
  END
  FROM (
    SELECT
      btrim(regexp_replace(lower(coalesce(addr, '')), '[^a-z0-9]+', ' ', 'g')) AS a,
      regexp_replace(lower(coalesce(postal, '')), '[^a-z0-9]', '', 'g') AS p
  ) AS parts;
$$;

-- One household per distinct (workspace, key); DISTINCT ON keeps the
-- lowest-id contact's address fields as the household's display address.
INSERT INTO public.households (workspace_id, household_key, address, city, province, postal)
SELECT DISTINCT ON (c.workspace, public.household_key_for(c.address, c.postal))
  c.workspace,
  public.household_key_for(c.address, c.postal),
  c.address,
  c.city,
  c.province,
  c.postal
FROM public.contact c
WHERE public.household_key_for(c.address, c.postal) IS NOT NULL
  AND c.workspace IS NOT NULL
ORDER BY c.workspace, public.household_key_for(c.address, c.postal), c.id
ON CONFLICT (workspace_id, household_key) DO NOTHING;

UPDATE public.contact c
SET household_id = h.id
FROM public.households h
WHERE c.household_id IS NULL
  AND h.workspace_id = c.workspace
  AND h.household_key = public.household_key_for(c.address, c.postal);

COMMIT;
