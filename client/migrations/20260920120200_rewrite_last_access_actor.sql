-- Replace auth.uid() with the v2 identity in
-- update_user_workspace_last_access_time (#1885, chunk 2).
--
-- auth.uid() is our Supabase-era shim (drizzle/0001_auth_uid_shim.sql); the v2
-- equivalent is app.current_user_id, set by withAppCurrentUser for every call
-- to this RPC (app/lib/db-rpc.server.ts). Inlining it removes the function's
-- dependency on the auth schema ahead of DROP SCHEMA auth.
--
-- Body copied verbatim from drizzle/0000_baseline.sql:4661 except the actor
-- expression. The empty search_path is preserved, so current_setting/nullif
-- resolve through pg_catalog as before.
CREATE OR REPLACE FUNCTION public.update_user_workspace_last_access_time(selected_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  UPDATE public.workspace_users SET last_accessed = NOW()
  WHERE workspace_users.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    AND workspace_users.workspace_id = selected_workspace_id;
end;
$$;
