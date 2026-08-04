import { eq } from "drizzle-orm";

import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

/**
 * Client-safe column projection of the `workspace` row.
 *
 * The projection is expressed in SQL (not a post-hoc omit of a full row) so the
 * secret-bearing columns never leave the database:
 *   - `key` / `token`   — Twilio API key SID + secret pair (ADR-0011)
 *   - `twilio_data`     — JSON blob holding the Twilio account SID/authToken
 *   - `stripe_id`       — Stripe customer id
 *
 * Route loaders under `app/routes/workspaces+/**` MUST use this instead of
 * `getWorkspaceById`, whose full row serializes into client-visible payloads.
 * Server-only callers that genuinely need credentials keep using
 * `getWorkspaceById`. Enforced by `npm run check:workspace-projection`.
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

export async function getWorkspaceForClient(workspaceId: string) {
  const [row] = await adminDb
    .select(workspaceClientColumns)
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  return row ?? null;
}
