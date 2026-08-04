-- Drop legacy Supabase-era RLS policies / enables (ADR-0004 / issue #1013).
-- Tenancy is enforced in-app via createTenantDb(workspaceId). These policies
-- were inert for the application role (most ENABLE ROW LEVEL SECURITY tables
-- had no policy = default deny unless the role bypasses RLS).
--
-- Does NOT touch app.current_user_id / auth.uid() actor context used by
-- SECURITY DEFINER RPCs via withAppCurrentUser.

BEGIN;

DROP POLICY IF EXISTS "Allow Auth  Users to get other users" ON public."user";
DROP POLICY IF EXISTS "Sudo users have full access to campaigns" ON public.campaign;
DROP POLICY IF EXISTS "Sudo users have full access to users" ON public."user";
DROP POLICY IF EXISTS "Sudo users have full access to workspaces" ON public.audience;
DROP POLICY IF EXISTS "Sudo users have full access to workspaces" ON public.campaign;
DROP POLICY IF EXISTS "Sudo users have full access to workspaces" ON public.contact;
DROP POLICY IF EXISTS "Sudo users have full access to workspaces" ON public.workspace;
DROP POLICY IF EXISTS "Sudo users have full access to workspaces" ON public.workspace_users;

ALTER TABLE IF EXISTS public.audience DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audience_upload DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.call DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaign DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaign_audience DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaign_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contact_audience DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.handset_session DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.message DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.outreach_attempt DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.script DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transaction_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_session DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workspace DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workspace_api_key DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workspace_invite DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workspace_number DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workspace_users DISABLE ROW LEVEL SECURITY;

COMMIT;
