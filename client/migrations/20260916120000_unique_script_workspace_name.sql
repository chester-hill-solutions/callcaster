-- Unique index on script(workspace, name): the app already maps a 23505
-- unique violation to "A script with this name already exists in the
-- workspace" (campaign.server.ts, api+/scripts.action.server.ts), but the
-- guard was unreachable because the table had no backing constraint. A user
-- could create two scripts named "Intro" in the same workspace and the
-- friendly error never fired (#1704/#1781).
--
-- Semantics match the existing name-unique indexes (workspace_role,
-- workspace_feature): case-sensitive on (workspace, name). No dedupe step —
-- both the review and production databases were verified duplicate-free for
-- (workspace, name) before this shipped (2026-09-16), matching how the
-- survey_response and workspace_api_key unique migrations shipped. On a
-- dirty restore, CREATE UNIQUE INDEX fails loudly instead of silently
-- dropping or orphaning referenced rows.
--
-- Re-runnable: IF NOT EXISTS.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS script_workspace_name_unique
  ON public.script (workspace, name);

COMMIT;