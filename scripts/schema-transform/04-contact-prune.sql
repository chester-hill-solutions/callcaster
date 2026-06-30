-- Phase 1 schema transform — step 04: prune contact columns
-- Target: Railway review Postgres ONLY.
-- Idempotent: DROP COLUMN IF EXISTS.
--
-- Plan: drop fullname, carrier, address_id — compute display name from
-- firstname + surname in app/export (docs/client-postgres-migration-plan.md).
--
-- Pre-check (run manually on review before drop):
--   SELECT count(*) FROM contact WHERE fullname IS NOT NULL AND fullname <> trim(coalesce(firstname,'') || ' ' || coalesce(surname,''));
--   SELECT count(*) FROM contact WHERE carrier IS NOT NULL;
--   SELECT count(*) FROM contact WHERE address_id IS NOT NULL;

BEGIN;

ALTER TABLE public.contact
  DROP COLUMN IF EXISTS fullname,
  DROP COLUMN IF EXISTS carrier,
  DROP COLUMN IF EXISTS address_id;

-- ─── Post-drop sanity ───────────────────────────────────────────────────────

DO $$
DECLARE
  col text;
  dropped text[] := ARRAY['fullname', 'carrier', 'address_id'];
BEGIN
  FOREACH col IN ARRAY dropped LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'contact'
        AND column_name = col
    ) THEN
      RAISE WARNING 'contact.% still present after prune step', col;
    END IF;
  END LOOP;
END $$;

COMMIT;
