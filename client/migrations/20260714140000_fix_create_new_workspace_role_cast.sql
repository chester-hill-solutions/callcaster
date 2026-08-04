-- Migration: Fix create_new_workspace role cast after workspace_role enum rename
-- 20260713180000_chs_workspace_membership renamed enum workspace_role →
-- workspace_users_role to free the name for the CHS workspace_role table. Both
-- create_new_workspace overloads (from the baseline) still cast
-- 'owner'::public.workspace_role, which now resolves to the CHS table's
-- composite row type, so every workspace creation fails with
-- "malformed record literal: \"owner\"". Recreate both overloads against the
-- renamed enum.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_new_workspace(new_workspace_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  new_workspace_id uuid;
begin
  INSERT INTO public.workspace (name) values
  (new_workspace_name) RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_users (workspace_id, user_id, role) values
  (new_workspace_id, auth.uid(), 'owner'::public.workspace_users_role);

  RETURN new_workspace_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.create_new_workspace(new_workspace_name text, user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.workspace (name)
  VALUES (new_workspace_name)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_users (workspace_id, user_id, role)
  VALUES (new_workspace_id, user_id, 'owner'::public.workspace_users_role);

  RETURN new_workspace_id;
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'Error creating workspace: %', SQLERRM;
END;
$$;

COMMIT;
