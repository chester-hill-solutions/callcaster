-- Phase 1 — step 08b: backfill households from contact.address (address_id dropped in 04)
-- Target: Railway review ONLY.

BEGIN;

ALTER TABLE public.contact DISABLE TRIGGER contact_change;

INSERT INTO public.households (household_key, workspace_id, address, city, province, postal)
SELECT DISTINCT ON (c.workspace, lower(btrim(c.address)))
  md5(c.workspace::text || '|' || lower(btrim(c.address))) AS household_key,
  c.workspace AS workspace_id,
  c.address,
  c.city,
  c.province,
  c.postal
FROM public.contact c
WHERE c.workspace IS NOT NULL
  AND c.address IS NOT NULL
  AND btrim(c.address) <> ''
ORDER BY c.workspace, lower(btrim(c.address))
ON CONFLICT (workspace_id, household_key) DO NOTHING;

UPDATE public.contact c
SET household_id = h.id
FROM public.households h
WHERE c.household_id IS NULL
  AND c.workspace IS NOT NULL
  AND c.address IS NOT NULL
  AND btrim(c.address) <> ''
  AND h.workspace_id = c.workspace
  AND h.household_key = md5(c.workspace::text || '|' || lower(btrim(c.address)));

ALTER TABLE public.contact ENABLE TRIGGER contact_change;

COMMIT;
