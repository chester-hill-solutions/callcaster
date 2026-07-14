import { job as jobTable } from "@/db/schema";
import { logger } from "@/lib/logger.server";
import { addRequestIdToJobParams } from "@/lib/request-context.server";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";

export type EnqueueDedupe =
  | { kind: "idempotency"; key: string }
  | {
      kind: "live";
      workspaceId?: string | null;
      /** Ignore the currently-running job when scheduling its successor. */
      excludeJobId?: number;
    }
  | { kind: "none" };

export type EnqueueJobArgs = {
  type: string;
  params?: Record<string, unknown>;
  workspaceId?: string | null;
  userId?: string | null;
  runAt?: Date | string | null;
  /**
   * Preferred dedupe strategy. When omitted, falls back to
   * `idempotencyKey` for backwards compatibility with webhook callers.
   */
  dedupe?: EnqueueDedupe;
  /** @deprecated Prefer `dedupe: { kind: "idempotency", key }`. */
  idempotencyKey?: string | null;
};

export type EnqueueJobResult = {
  enqueued: boolean;
  jobId?: number;
  revived?: boolean;
  deduped?: boolean;
};

function resolveDedupe(args: EnqueueJobArgs): EnqueueDedupe {
  if (args.dedupe) {
    return args.dedupe;
  }
  const key = args.idempotencyKey?.trim();
  if (key) {
    return { kind: "idempotency", key };
  }
  return { kind: "none" };
}

/**
 * Revive a dead-lettered job with the same idempotency key so Twilio
 * redelivery can re-run billing/side effects after a prior terminal failure.
 * Concurrent revive races return null (another claim already won).
 */
async function reviveDeadLetterJob(args: {
  type: string;
  idempotencyKey: string;
  params: Record<string, unknown>;
  workspaceId?: string | null;
  userId?: string | null;
  runAt?: Date | string | null;
}): Promise<number | null> {
  const rows = (await db.execute(sql`
    UPDATE job
    SET status = 'queued',
        params = ${JSON.stringify(args.params)}::jsonb,
        workspace_id = ${args.workspaceId ?? null},
        user_id = ${args.userId ?? null},
        attempt_count = 0,
        dead_letter_reason = NULL,
        error_message = NULL,
        error = NULL,
        failed_at = NULL,
        claimed_by = NULL,
        claimed_until = NULL,
        started_at = NULL,
        completed_at = NULL,
        retry_at = ${
          args.runAt instanceof Date
            ? args.runAt.toISOString()
            : (args.runAt ?? null)
        },
        updated_at = now()
    WHERE type = ${args.type}
      AND idempotency_key = ${args.idempotencyKey}
      AND status = 'dead_letter'
    RETURNING id
  `)) as Array<{ id: number }>;

  const jobId = rows[0]?.id;
  if (jobId == null) {
    return null;
  }

  logger.info("worker.enqueue.revived_dead_letter", {
    type: args.type,
    jobId,
    idempotencyKey: args.idempotencyKey,
  });
  return jobId;
}

async function enqueueWithIdempotency(args: {
  type: string;
  params: Record<string, unknown>;
  workspaceId?: string | null;
  userId?: string | null;
  runAt?: Date | string | null;
  idempotencyKey: string;
}): Promise<EnqueueJobResult> {
  const rows = (await db.execute(sql`
    INSERT INTO job (
      type, status, params, workspace_id, user_id, retry_at, idempotency_key
    )
    VALUES (
      ${args.type},
      'queued',
      ${JSON.stringify(args.params)}::jsonb,
      ${args.workspaceId ?? null},
      ${args.userId ?? null},
      ${args.runAt instanceof Date ? args.runAt.toISOString() : (args.runAt ?? null)},
      ${args.idempotencyKey}
    )
    ON CONFLICT (type, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
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
      idempotencyKey: args.idempotencyKey,
    });
    return { enqueued: true, jobId };
  }

  const revivedId = await reviveDeadLetterJob(args);
  if (revivedId != null) {
    return { enqueued: true, jobId: revivedId, revived: true };
  }

  logger.debug("worker.enqueue.deduped", {
    type: args.type,
    idempotencyKey: args.idempotencyKey,
  });
  return { enqueued: false, deduped: true };
}

async function enqueueWithLiveDedupe(args: {
  type: string;
  params: Record<string, unknown>;
  workspaceId?: string | null;
  userId?: string | null;
  runAt?: Date | string | null;
  excludeJobId?: number;
}): Promise<EnqueueJobResult> {
  const workspaceId = args.workspaceId ?? null;
  const lockKey = `${args.type}:${workspaceId ?? "global"}`;

  return db.transaction(async (tx) => {
    // Serialize check + insert for this type/workspace pair. Unlike a unique
    // index, this can ignore the currently-running coordinator while it
    // schedules its successor.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const existing = (await tx.execute(sql`
      SELECT id
      FROM job
      WHERE type = ${args.type}
        AND status IN ('queued', 'running')
        AND workspace_id IS NOT DISTINCT FROM ${workspaceId}
        AND (${args.excludeJobId ?? null}::integer IS NULL
          OR id <> ${args.excludeJobId ?? null})
      ORDER BY created_at ASC
      LIMIT 1
    `)) as Array<{ id: number }>;

    const existingId = existing[0]?.id;
    if (existingId != null) {
      logger.info(`jobs.${args.type}.enqueue_deduped`, {
        workspaceId,
      });
      return {
        enqueued: false,
        deduped: true,
        jobId: existingId,
      };
    }

    const [row] = await tx
      .insert(jobTable)
      .values({
        type: args.type,
        status: "queued",
        params: args.params,
        workspace_id: workspaceId,
        user_id: args.userId ?? null,
        retry_at:
          args.runAt instanceof Date
            ? args.runAt.toISOString()
            : (args.runAt ?? null),
      })
      .returning({ id: jobTable.id });

    if (!row) {
      throw new Error(`Failed to enqueue job type ${args.type}`);
    }

    logger.info(`jobs.${args.type}.enqueued`, {
      jobId: row.id,
      workspaceId,
    });
    return { enqueued: true, jobId: row.id };
  });
}

/**
 * Insert a queued job row. Dedup strategies:
 * - `idempotency`: unique key; revives dead-letter rows on conflict
 * - `live`: skip if queued/running row of same type (+ optional workspace) exists
 * - `none`: always insert
 */
export async function enqueueJob(
  args: EnqueueJobArgs,
): Promise<EnqueueJobResult> {
  const params = addRequestIdToJobParams(args.params ?? {});
  const dedupe = resolveDedupe(args);

  switch (dedupe.kind) {
    case "idempotency": {
      const key = dedupe.key.trim();
      if (!key) {
        break;
      }
      return enqueueWithIdempotency({
        type: args.type,
        params,
        workspaceId: args.workspaceId,
        userId: args.userId,
        runAt: args.runAt,
        idempotencyKey: key,
      });
    }
    case "live":
      return enqueueWithLiveDedupe({
        type: args.type,
        params,
        workspaceId: dedupe.workspaceId ?? args.workspaceId,
        userId: args.userId,
        runAt: args.runAt,
        excludeJobId: dedupe.excludeJobId,
      });
    case "none":
      break;
    default: {
      const _exhaustive: never = dedupe;
      void _exhaustive;
      break;
    }
  }

  const [row] = await db
    .insert(jobTable)
    .values({
      type: args.type,
      status: "queued",
      params,
      workspace_id: args.workspaceId ?? null,
      user_id: args.userId ?? null,
      retry_at:
        args.runAt instanceof Date
          ? args.runAt.toISOString()
          : (args.runAt ?? null),
    })
    .returning({ id: jobTable.id });

  if (!row) {
    throw new Error(`Failed to enqueue job type ${args.type}`);
  }

  logger.debug("worker.enqueue", { type: args.type, jobId: row.id });
  return { enqueued: true, jobId: row.id };
}
