import { eq } from "drizzle-orm";

import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { timestampToIsoString } from "@/lib/parse-utils.server";

/**
 * Client-safe column projection of the `workspace` row.
 *
 * Product route reads select these columns in SQL, so the secret-bearing
 * columns stay in the database:
 *   - `key` / `token`   — Twilio API key SID + secret pair (ADR-0011)
 *   - `twilio_data`     — JSON blob holding the Twilio account SID/authToken
 *   - `stripe_id`       — Stripe customer id
 *
 * Route loaders under `app/routes/workspaces+/**` MUST use this instead of
 * `getWorkspaceById`, whose full row serializes into client-visible payloads.
 * Server-only callers that need credentials keep using `getWorkspaceById`.
 * Admin services derive health from those rows, then use the same positive
 * field set before returning a response. The import/type gate and serialized
 * response tests cover these boundaries.
 */
const workspaceClientColumns = {
  id: workspaceTable.id,
  name: workspaceTable.name,
  created_at: workspaceTable.created_at,
  credits: workspaceTable.credits,
  disabled: workspaceTable.disabled,
  feature_flags: workspaceTable.feature_flags,
  coaching_config: workspaceTable.coaching_config,
} as const;

export type WorkspaceForClient = Awaited<
  ReturnType<typeof getWorkspaceForClient>
>;

export type WorkspaceClientData = ReturnType<typeof projectWorkspaceForClient>;

/** Admin services also derive health from server-only rows before returning them. */
export function projectWorkspaceForClient(workspace: NonNullable<WorkspaceForClient>) {
  return {
    id: workspace.id,
    name: workspace.name,
    created_at: timestampToIsoString(workspace.created_at),
    credits: workspace.credits,
    disabled: workspace.disabled,
    feature_flags: workspace.feature_flags,
    coaching_config: workspace.coaching_config,
  };
}

export async function getWorkspaceForClient(workspaceId: string) {
  const [row] = await adminDb
    .select(workspaceClientColumns)
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  return row ?? null;
}
