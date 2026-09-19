-- Drop legacy Supabase `auth.users` foreign keys from public tables.
--
-- The v2 stack has no Supabase auth: identities live in `auth_user` (Better
-- Auth) mirrored to `public.user`. The legacy `auth` schema still exists on
-- migrated databases but its `users` table is EMPTY, so any insert that
-- satisfies these constraints fails.
--
-- Symptom on dev: every `workspace_invite` insert failed the FK to
-- `auth.users` ("Failed query: insert into workspace_invite ..."); prod still
-- had the old Supabase rows, so it worked there (#1853).
--
-- Re-runnable: IF EXISTS.
ALTER TABLE public.workspace_invite
  DROP CONSTRAINT IF EXISTS workspace_invite_user_id_fkey1;

ALTER TABLE public.workspace_api_key
  DROP CONSTRAINT IF EXISTS workspace_api_key_created_by_fkey;
