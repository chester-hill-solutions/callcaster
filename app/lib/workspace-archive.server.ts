import { eq } from "drizzle-orm";

import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { removeWorkspacePhoneNumber } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import {
  archiveWorkspaceById,
  isWorkspaceArchivedById,
} from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";

export type ArchiveWorkspaceResult =
  | { ok: true; archivedAt: Date; releasedNumbers: number }
  | { ok: false; error: string; status: number };

/**
 * Is this workspace archived? (#2732)
 *
 * Archived workspaces keep every row but are hidden from the people who used
 * them: the picker omits them and the workspace layout redirects away. Operators
 * still reach the data through the admin surfaces, which is the point of
 * archiving rather than deleting.
 */
export async function isWorkspaceArchived(
  workspaceId: string,
): Promise<boolean> {
  return isWorkspaceArchivedById(workspaceId);
}

/**
 * Archive a workspace: release its numbers at the provider, then hide it.
 *
 * Order matters, and it is the whole reason this is an archive rather than a
 * delete. `workspace_number` and `workspace_number_purchase` carry
 * `ON DELETE CASCADE` from `workspace`, so deleting the workspace row first
 * destroys the only record of which Twilio numbers to release; those numbers
 * then keep billing with nothing in the app pointing at them. Releasing first
 * also stops the rental charge, which is what the owner is actually asking for.
 *
 * A failed release stops the archive. The workspace stays visible, the error
 * names the number, and the existing release state machine records what
 * happened, so a retry resumes instead of releasing twice.
 */
export async function archiveWorkspace(
  workspaceId: string,
): Promise<ArchiveWorkspaceResult> {
  const tdb = createTenantDb(workspaceId);
  const numbers = await tdb.workspace_number.findMany({
    where: eq(workspaceNumberTable.workspace, workspaceId),
  });

  const failures: string[] = [];
  for (const number of numbers) {
    const result = await removeWorkspacePhoneNumber({
      workspaceId,
      numberId: BigInt(number.id),
    });
    if (result.error) {
      failures.push(number.phone_number ?? `#${number.id}`);
    }
  }

  if (failures.length > 0) {
    logger.error("workspace.archive.number_release_failed", {
      workspaceId,
      failures,
    });
    return {
      ok: false,
      status: 409,
      error:
        failures.length === 1
          ? `Could not release ${failures[0]}. The workspace was not archived — try again.`
          : `Could not release ${failures.length} numbers (${failures.join(", ")}). The workspace was not archived — try again.`,
    };
  }

  const archivedAt = new Date();
  const archived = await archiveWorkspaceById(workspaceId, archivedAt);

  if (!archived) {
    return { ok: false, status: 404, error: "Workspace not found." };
  }

  return { ok: true, archivedAt, releasedNumbers: numbers.length };
}
