import { job as jobTable } from "@/db/schema";
import { logger } from "@/lib/logger.server";
import { addRequestIdToJobParams } from "@/lib/request-context.server";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";

export type EnqueueJobArgs = {
  type: string;
  params?: Record<string, unknown>;
  workspaceId?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
};

export type EnqueueJobResult = {
  enqueued: boolean;
  jobId?: number;
};

/**
 * Insert a queued job row. When `idempotencyKey` is set, duplicate keys are
 * ignored via the partial unique index on `job.idempotency_key`.
 */
export async function enqueueJob(
  args: EnqueueJobArgs,
): Promise<EnqueueJobResult> {
  const params = addRequestIdToJobParams(args.params ?? {});
  const idempotencyKey = args.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const rows = (await db.execute(sql`
      INSERT INTO job (type, status, params, workspace_id, user_id, idempotency_key)
      VALUES (
        ${args.type},
        'queued',
        ${JSON.stringify(params)}::jsonb,
        ${args.workspaceId ?? null},
        ${args.userId ?? null},
        ${idempotencyKey}
      )
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id
    `)) as Array<{ id: number }>;

    if (rows.length > 0) {
      const jobId = rows[0]?.id;
      if (jobId == null) {
        return { enqueued: false };
      }
      logger.debug("worker.enqueue", {
        type: args.type,
        jobId,
        idempotencyKey,
      });
      return { enqueued: true, jobId };
    }

    logger.debug("worker.enqueue.deduped", {
      type: args.type,
      idempotencyKey,
    });
    return { enqueued: false };
  }

  const [row] = await db
    .insert(jobTable)
    .values({
      type: args.type,
      status: "queued",
      params,
      workspace_id: args.workspaceId ?? null,
      user_id: args.userId ?? null,
    })
    .returning({ id: jobTable.id });

  if (!row) {
    throw new Error(`Failed to enqueue job type ${args.type}`);
  }

  logger.debug("worker.enqueue", { type: args.type, jobId: row.id });
  return { enqueued: true, jobId: row.id };
}
