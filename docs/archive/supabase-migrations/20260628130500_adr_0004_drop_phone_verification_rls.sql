-- ADR-0004: Scoped Drizzle client, no RLS
-- Drop the last remaining RLS policy on phone_verification. Tenancy and
-- per-user access are enforced in the app layer (requireWorkspaceAccess /
-- createTenantDb), not via Postgres RLS. phone_verification is a global,
-- user-scoped table (no workspace column); access is gated by the authenticated
-- user id in app code, so RLS is redundant and untestable here.

DROP POLICY IF EXISTS "Users can only access their own phone verifications" ON phone_verification;

ALTER TABLE phone_verification DISABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verification NO FORCE ROW LEVEL SECURITY;

-- Revoke the authenticated-role grant; access is mediated by the app connection
-- (which uses the service role / a dedicated role), not the Supabase
-- `authenticated` role. Kept idempotent.
REVOKE ALL ON phone_verification FROM authenticated;
