import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { job as jobTable } from "@/db/schema";
import { logger } from "@/lib/logger.server";
import { addRequestIdToJobParams } from "@/lib/request-context.server";
import { db } from "@/server/db";

export type EnqueueCronJobResult = {
  ok: true;
  enqueued: boolean;
  deduped: boolean;
  jobId: number | undefined;
};

/**
 * Enqueue a coordinator job for the Bun worker, deduping against live rows.
 * Used by leftover `/api/jobs/*` HTTP cron entrypoints during WS-A cutover so
 * the web process never runs heavy sweeps inline.
 */
export async function enqueueCronJobRow(args: {
  type: string;
  workspaceId?: string;
  params?: Record<string, unknown>;
}): Promise<EnqueueCronJobResult> {
  const workspaceClause: SQL | undefined = args.workspaceId
    ? eq(jobTable.workspace_id, args.workspaceId)
    : isNull(jobTable.workspace_id);

  const existing = await db
    .select({ id: jobTable.id })
    .from(jobTable)
    .where(
      and(
        eq(jobTable.type, args.type),
        inArray(jobTable.status, ["queued", "running"]),
        workspaceClause,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    logger.info(`jobs.${args.type}.enqueue_deduped`, {
      workspaceId: args.workspaceId,
    });
    return {
      ok: true,
      enqueued: false,
      deduped: true,
      jobId: existing[0]?.id,
    };
  }

  const [row] = await db
    .insert(jobTable)
    .values({
      type: args.type,
      status: "queued",
      workspace_id: args.workspaceId ?? null,
      params: addRequestIdToJobParams(args.params ?? {}),
    })
    .returning({ id: jobTable.id });

  logger.info(`jobs.${args.type}.enqueued`, {
    jobId: row?.id,
    workspaceId: args.workspaceId,
  });
  return {
    ok: true,
    enqueued: true,
    deduped: false,
    jobId: row?.id,
  };
}
