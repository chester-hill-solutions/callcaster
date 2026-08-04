/** DDL for workspace_invitation + one pending invite per workspace/email. */
export const WORKSPACE_INVITATION_DDL = `
CREATE TABLE IF NOT EXISTS "workspace_invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
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
`;
