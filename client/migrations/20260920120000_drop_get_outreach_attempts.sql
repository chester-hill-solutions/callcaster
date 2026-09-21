-- Drop the dead get_outreach_attempts RPC (#1885, chunk 1).
--
-- It has no application caller and cannot run on a v2 database: it joins the
-- dropped workspace_permissions table and casts to the CHS workspace_role row
-- type. Its only remaining reference is a KEEP entry in
-- scripts/db/check-db-orphans.mjs, removed in the same change.
--
-- Signature matches drizzle/0000_baseline.sql:2993
-- (campaign_id_param integer, workspace_id_param uuid).
DROP FUNCTION IF EXISTS public.get_outreach_attempts(integer, uuid);
