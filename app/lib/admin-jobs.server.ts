import { and, desc, eq, sql } from "drizzle-orm";
import { job as jobTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { logger } from "@/lib/logger.server";
import { validateStoredJobParams } from "@/lib/worker/job-params.server";

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

export type RequeueResult =
  | { ok: true; jobId: number; type: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_params"; error: string };

/**
 * Return a dead-lettered job to the queue.
 *
 * Dead-lettering a money job (`call_status_side_effects`,
 * `sms_status_side_effects`, `number_rental_billing`, `billing_reconcile`)
 * means a debit was never applied. Until this existed the ops alert announced
 * that loss but the only way to reinstate it was hand-written SQL against
 * production, so the alert was effectively informational.
 *
 * Re-running is safe because the debit paths are idempotent at the database:
 * `apply_ledger_entry_and_sync_credits` rejects a duplicate idempotency key, so
 * a job whose failure happened *after* the ledger write will not double-charge.
 *
 * `attempt_count` resets to 0 rather than being left at max, because
 * `claimNextJob` increments it on claim and `max_attempts` is compared against
 * it — leaving it at the ceiling would dead-letter the job again on its first
 * failure instead of giving it a fresh set of retries.
 *
 * The status predicate is part of the UPDATE, not a preceding SELECT, so two
 * admins clicking at once cannot both requeue: the second matches no row and
 * gets `not_found`.
 *
 * Before flipping the status, the row's stored `type`/`params` are validated
 * against the job registry (#1239 A3, `validateStoredJobParams`): a
 * dead-lettered row can be any registered type with arbitrary stored params,
 * so this can't be pinned to one literal type at compile time the way a
 * normal enqueue call site can. Reinstating a row whose params no longer
 * pass validation would just dead-letter it again on the next attempt, so
 * that's rejected up front with a typed reason instead.
 */
export async function requeueDeadLetteredJob(
  jobId: number,
  actorUserId: string,
): Promise<RequeueResult> {
  const [existing] = await adminDb
    .select({ type: jobTable.type, params: jobTable.params })
    .from(jobTable)
    .where(and(eq(jobTable.id, jobId), eq(jobTable.status, DEAD_LETTER_JOB_STATUS)));

  if (!existing) {
    return { ok: false, reason: "not_found" };
  }

  const validated = validateStoredJobParams(existing.type, existing.params);
  if (!validated.ok) {
    logger.error("admin.job.requeue_rejected", {
      jobId,
      jobType: existing.type,
      actorUserId,
      error: validated.error,
    });
    return { ok: false, reason: "invalid_params", error: validated.error };
  }

  const [row] = await adminDb
    .update(jobTable)
    .set({
      status: "queued",
      attempt_count: 0,
      claimed_by: null,
      claimed_until: null,
      retry_at: null,
      started_at: null,
      failed_at: null,
      dead_letter_reason: null,
      error: null,
      error_message: null,
      updated_at: sql`now()`,
    })
    .where(and(eq(jobTable.id, jobId), eq(jobTable.status, DEAD_LETTER_JOB_STATUS)))
    .returning({ id: jobTable.id, type: jobTable.type });

  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  logger.info("admin.job.requeued", {
    jobId: row.id,
    jobType: row.type,
    actorUserId,
  });

  return { ok: true, jobId: row.id, type: row.type };
}
