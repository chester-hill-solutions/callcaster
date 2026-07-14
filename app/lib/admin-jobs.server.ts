import { desc, eq } from "drizzle-orm";
import { job as jobTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

export const DEAD_LETTER_JOB_STATUS = "dead_letter";

/** Read-only diagnostics for the most recently dead-lettered jobs. */
export async function listRecentDeadLetteredJobs(limit = 25) {
  return adminDb
    .select({
      id: jobTable.id,
      type: jobTable.type,
      workspace_id: jobTable.workspace_id,
      attempt_count: jobTable.attempt_count,
      max_attempts: jobTable.max_attempts,
      dead_letter_reason: jobTable.dead_letter_reason,
      error_message: jobTable.error_message,
      failed_at: jobTable.failed_at,
      created_at: jobTable.created_at,
    })
    .from(jobTable)
    .where(eq(jobTable.status, DEAD_LETTER_JOB_STATUS))
    .orderBy(desc(jobTable.failed_at))
    .limit(limit);
}
