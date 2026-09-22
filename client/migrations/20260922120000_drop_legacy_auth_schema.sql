-- #1885 chunk 3: drop the legacy Supabase-era `auth` schema.
--
-- Chunks 1-2 (20260920120000, 20260920120100, 20260920120200) dropped the dead
-- get_outreach_attempts RPC and rewrote the last two public functions that used
-- auth.uid()/auth.jwt() onto the v2 `app.current_user_id` actor, so nothing
-- in the app's code or migration lineage touches auth.* anymore.
--
-- This migration fails closed: anything outside schema `auth` that still
-- references auth.* (a function body, a view definition) aborts the migration
-- with a clear error instead of letting CASCADE silently delete the dependent
-- object. Only a clean tree gets the drop.

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM (
    SELECT 'function' AS kind, p.oid::text AS obj
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname <> 'auth'
      AND pg_get_functiondef(p.oid) ~ '\mauth\.'
    UNION ALL
    SELECT 'view', v.oid::text
    FROM pg_catalog.pg_views v
    WHERE v.schemaname <> 'auth'
      AND v.definition ~ '\mauth\.'
  ) dependents;

  IF n > 0 THEN
    RAISE EXCEPTION 'Cannot drop schema auth: % object(s) still reference auth.* — rewrite them off the legacy schema first.', n;
  END IF;
END $$;

DROP SCHEMA IF EXISTS auth CASCADE;