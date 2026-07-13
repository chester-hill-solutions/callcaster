-- Wave 1 scaffold: CHS canonical membership / feature / invitation tables.
-- Additive only — does NOT drop workspace_users / workspace_invite or switch readers.
-- Mirror of drizzle/0008_chs_workspace_membership.sql for client migration ledger.
-- Source: @chester-hill-solutions/auth-postgres@0.3.0 DDL exports (adapted).
-- See docs/remediation/wave1-membership-migration-2026-07-13.md.

-- ---------------------------------------------------------------------------
-- 0. Free the workspace_role type name for the CHS table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'workspace_role'
      AND t.typtype = 'e'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'workspace_users_role'
  ) THEN
    ALTER TYPE public.workspace_role RENAME TO workspace_users_role;
  END IF;
END $$;

COMMENT ON TYPE public.workspace_users_role IS
  'Legacy workspace_users / workspace_invite role enum (renamed so CHS table workspace_role can exist)';

-- ---------------------------------------------------------------------------
-- 1. workspace_role / workspace_feature / workspace_feature_permission + RPC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "workspace_role" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "workspace_id" text,
  "rank" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_role_workspace_name_idx"
  ON "workspace_role" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "workspace_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_feature_workspace_name_idx"
  ON "workspace_feature" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "workspace_feature_permission" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text,
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

-- ---------------------------------------------------------------------------
-- 2. workspace_member
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "workspace_member" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role_id" text NOT NULL REFERENCES "workspace_role"("id"),
  "invited_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_member_workspace_user_idx"
  ON "workspace_member" ("workspace_id", "user_id");

CREATE INDEX IF NOT EXISTS "workspace_member_user_id_idx"
  ON "workspace_member" ("user_id");

-- ---------------------------------------------------------------------------
-- 3. workspace_invitation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "workspace_invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "email" text NOT NULL,
  "role_id" text NOT NULL,
  "invited_by_user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "accepted_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitation_pending_email_idx"
  ON "workspace_invitation" ("workspace_id", "email")
  WHERE "status" = 'pending';

-- ---------------------------------------------------------------------------
-- 4. Global product role seeds
-- ---------------------------------------------------------------------------
INSERT INTO "workspace_role" ("id", "name", "workspace_id", "rank")
VALUES
  ('caller', 'caller', NULL, 0),
  ('member', 'member', NULL, 1),
  ('admin', 'admin', NULL, 2),
  ('owner', 'owner', NULL, 3)
ON CONFLICT ("id") DO NOTHING;

COMMENT ON TABLE "workspace_member" IS
  'CHS canonical membership; backfill from workspace_users before reader switch';
COMMENT ON TABLE "workspace_invitation" IS
  'CHS email-first invitations (SEC-03); legacy workspace_invite remains until adopt';
COMMENT ON TABLE "workspace_role" IS
  'CHS role templates (global when workspace_id IS NULL)';
