/** Postgres RPC + authz table DDL for tests and migrations. */
export const WORKSPACE_FEATURE_AUTHZ_DDL = `
CREATE TABLE IF NOT EXISTS "workspace_role" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "rank" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_role_workspace_name_idx"
  ON "workspace_role" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_feature_workspace_name_idx"
  ON "workspace_feature" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature_permission" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text REFERENCES "workspace"("id") ON DELETE CASCADE,
  "role_id" text NOT NULL REFERENCES "workspace_role"("id") ON DELETE CASCADE,
  "feature_id" text NOT NULL REFERENCES "workspace_feature"("id") ON DELETE CASCADE,
  "allowed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_feature_permission_scope_idx"
  ON "workspace_feature_permission" ("workspace_id", "role_id", "feature_id");

CREATE OR REPLACE FUNCTION check_workspace_feature_permission(
  p_workspace_id text,
  p_role_id text,
  p_feature_id text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT wfp.allowed
      FROM workspace_feature_permission wfp
      WHERE wfp.role_id = p_role_id
        AND wfp.feature_id = p_feature_id
        AND (wfp.workspace_id IS NULL OR wfp.workspace_id = p_workspace_id)
      ORDER BY CASE
        WHEN wfp.workspace_id = p_workspace_id THEN 0
        WHEN wfp.workspace_id IS NULL THEN 1
        ELSE 2
      END
      LIMIT 1
    ),
    false
  );
$$;
`;
/** Migrate workspace_member.role enum column to role_id FK. Idempotent when role_id already exists. */
export const WORKSPACE_MEMBER_ROLE_ID_MIGRATION_DDL = `
ALTER TABLE "workspace_member" ADD COLUMN IF NOT EXISTS "role_id" text REFERENCES "workspace_role"("id");

UPDATE "workspace_member" wm
SET "role_id" = wm."role"
WHERE wm."role_id" IS NULL
  AND EXISTS (SELECT 1 FROM "workspace_role" wr WHERE wr."id" = wm."role");

ALTER TABLE "workspace_member" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "workspace_member" DROP COLUMN IF EXISTS "role";
`;
