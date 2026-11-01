import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
  buildAssignedQueueUpdate,
  buildDequeuedQueueUpdate,
  buildProviderStatusQueueUpdate,
  buildQueuedQueueUpdate,
  QUEUE_LIFECYCLE_ASSIGNED,
  QUEUE_STATUS_DEQUEUED,
  QUEUE_STATUS_QUEUED,
} from "@/lib/queue-status";
import {
  campaign as campaignTable,
  campaign_queue as campaignQueueTable,
  contact as contactTable,
} from "@/db/schema";
import { db, type Database } from "@/server/db";
import { loadContactsByQueueRows } from "@/lib/campaign-queue-contacts.server";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { emitQueueEvent } from "@/lib/workspace-events.server";
import { rpcDequeueContact, type RpcExecutor } from "@/lib/db-rpc.server";
import {
  completeCampaignsDrainedByDequeue,
  tryCompleteDrainedCampaigns,
} from "@/lib/campaign-queue-completion.server";
import type { CampaignQueueUpdate } from "@/lib/db-types";

/**
 * A `campaign_queue` update payload: each column's own value type, or a raw
 * `SQL` fragment where the new value must be computed in the database.
 *
 * This was `Record<string, unknown>`, so no value in a queue write was ever
 * checked — `dequeued_at` could take an ISO string while the column is a
 * `timestamptz` and the compiler stayed quiet (#2213), and eight call sites
 * were free to repeat that. The inferred insert type does not admit `SQL` for a
 * plain integer, so the fragment case is declared here rather than cast at the
 * one call site that needs it (`attempt_count + 1`).
 *
 * The sibling `buildQueueEntryUpdate` had the same hole and was closed in
 * #2233; this is that closure one layer down.
 */
type QueueColumnWrite = {
  [K in keyof CampaignQueueUpdate]?: CampaignQueueUpdate[K] | SQL;
};

export type ClaimedQueueContact = {
  contact_id: number;
  queue_id: number;
  caller_id: string;
  contact_phone: string;
};

type CampaignQueueRow = typeof campaignQueueTable.$inferSelect;

/** Collects publish work to run after a transaction commits. */
export type DeferredEmit = (publish: () => Promise<void>) => void;

/**
 * The slice of a Drizzle client (or transaction) these queue writes need.
 * `execute` is included so one transaction threads through both this module and
 * the RPC helpers, which want an `RpcExecutor`.
 */
export type QueueWriteExecutor = Pick<Database, "select" | "update"> & RpcExecutor;

async function emitQueueRowUpdates(
  workspaceId: string,
  oldRows: CampaignQueueRow[],
  newRows: CampaignQueueRow[],
) {
  const oldById = new Map(oldRows.map((row) => [row.id, row]));
  await Promise.all(
    newRows.map((newRow) =>
      emitQueueEvent(
        workspaceId,
        "UPDATE",
        newRow as Record<string, unknown>,
        (oldById.get(newRow.id) ?? null) as Record<string, unknown> | null,
      ),
    ),
  );
}

async function emitQueueRowDeletes(workspaceId: string, deletedRows: CampaignQueueRow[]) {
  await Promise.all(
    deletedRows.map((oldRow) =>
      emitQueueEvent(workspaceId, "DELETE", null, oldRow as Record<string, unknown>),
    ),
  );
}

/**
 * Update campaign_queue rows and emit SSE postgres_change events.
 * Loads old rows once, mutates, then emits UPDATE events.
 *
 * Exported so `campaign-queue-updates.server.ts` writes keyed rows through
 * this instead of copying it. One writer means a publish can never end up
 * conditional for keyed updates and unconditional for everything else.
 */
export async function updateCampaignQueueAndEmit(args: {
  conditions: SQL[];
  /** The real update shape, inferred from the schema — see {@link QueueColumnWrite}. */
  set: QueueColumnWrite;
  workspaceId?: string;
  exec?: QueueWriteExecutor;
  deferEmit?: DeferredEmit;
}): Promise<CampaignQueueRow[]> {
  const exec = args.exec ?? db;
  const where = and(...args.conditions);
  const oldRows = await exec.select().from(campaignQueueTable).where(where);
  const updated = await exec
    .update(campaignQueueTable)
    .set(args.set)
    .where(where)
    .returning();

  const resolvedWorkspaceId = args.workspaceId ?? updated[0]?.workspace;
  if (resolvedWorkspaceId) {
    const publish = () =>
      emitQueueRowUpdates(resolvedWorkspaceId, oldRows, updated);
    if (args.deferEmit) {
      args.deferEmit(publish);
    } else {
      await publish();
    }
  }
  return updated;
}

/**
 * Delete campaign_queue rows and emit SSE DELETE events when a workspace is known.
 */
async function deleteCampaignQueueAndEmit(args: {
  conditions: SQL[];
  workspaceId?: string;
}): Promise<CampaignQueueRow[]> {
  const where = and(...args.conditions);
  const deleted = await db.delete(campaignQueueTable).where(where).returning();
  if (args.workspaceId) {
    await emitQueueRowDeletes(args.workspaceId, deleted);
  }
  return deleted;
}

const MAX_OPT_OUT_CLAIM_SKIPS = 10;

/**
 * Atomically claim the next queued contact for a campaign.
 *
 * Uses the Postgres `claim_next_queue_contact` RPC which serializes per-campaign
 * claims with an advisory lock and selects the candidate row with
 * `FOR UPDATE SKIP LOCKED`. The row is updated to `status = 'assigned'` and
 * `assigned_to_user_id = userId` only if it is still queued. Returns the claimed
 * row only when the update succeeded.
 *
 * Claims whose contact has `opt_out = true` are dequeued and skipped (bounded
 * by {@link MAX_OPT_OUT_CLAIM_SKIPS}); returns null when the bound is hit.
 */
export async function claimNextQueueContact(
  tdb: TenantDb,
  campaignId: number,
  userId: string,
  options?: { deferEmit?: DeferredEmit },
): Promise<ClaimedQueueContact | null> {
  const publish = async (workspaceId: string, oldRows: CampaignQueueRow[], newRows: CampaignQueueRow[]) => {
    const emit = () => emitQueueRowUpdates(workspaceId, oldRows, newRows);
    if (options?.deferEmit) options.deferEmit(emit);
    else await emit();
  };
  for (let attempt = 0; attempt < MAX_OPT_OUT_CLAIM_SKIPS; attempt++) {
    const rows = await tdb.execute(
      sql`select * from claim_next_queue_contact(${campaignId}, ${userId}::uuid)`,
    );
    const row = rows[0] as ClaimedQueueContact | undefined;
    if (!row || !row.queue_id) return null;
    const queueRow = await tdb.campaign_queue.findFirst({ where: eq(campaignQueueTable.id, row.queue_id) });
    if (!queueRow) return null;
    await publish(queueRow.workspace, [], [queueRow]);

    // Reads and opt-out writes use the same tenant transaction as the claim.
    // A later explicit re-add must survive this older claim's cleanup.
    const contactRow = await tdb.contact.findFirst({ where: eq(contactTable.id, row.contact_id), columns: { opt_out: true } });
    if (contactRow?.opt_out) {
      const updated = await tdb.campaign_queue.update({ set: buildDequeuedQueueUpdate(userId, "Contact opted out"), where: and(
        eq(campaignQueueTable.id, row.queue_id), eq(campaignQueueTable.dispatch_generation, queueRow.dispatch_generation),
        eq(campaignQueueTable.queue_state, QUEUE_LIFECYCLE_ASSIGNED), eq(campaignQueueTable.assigned_to_user_id, userId),
        isNull(campaignQueueTable.dequeued_at),
      ) });
      await publish(queueRow.workspace, [queueRow], updated);
      continue;
    }
    return row;
  }
  return null;
}

export function buildQueueStatusUpdatePayload(status: string) {
  if (status === QUEUE_STATUS_QUEUED) {
    return buildQueuedQueueUpdate();
  }
  if (status === QUEUE_STATUS_DEQUEUED) {
    return buildDequeuedQueueUpdate(null, "api");
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(status)) {
    return buildAssignedQueueUpdate(status);
  }
  return buildProviderStatusQueueUpdate(status);
}

export async function updateCampaignQueueStatusByIds(
  ids: number[],
  status: string,
  workspaceId: string,
) {
  if (ids.length === 0) {
    return;
  }
  const set: QueueColumnWrite = buildQueueStatusUpdatePayload(status);
  if (status === QUEUE_STATUS_QUEUED) {
    set.dispatch_generation = sql`gen_random_uuid()`;
    set.redial_requested_at = sql`clock_timestamp()`;
  }

  await updateCampaignQueueAndEmit({
    conditions: [
      inArray(campaignQueueTable.id, ids),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    set,
    workspaceId,
  });
}

export async function deleteCampaignQueueByIds(ids: number[], workspaceId: string) {
  if (ids.length === 0) {
    return [];
  }

  return deleteCampaignQueueAndEmit({
    conditions: [
      inArray(campaignQueueTable.id, ids),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    workspaceId,
  });
}

export async function deleteAllCampaignQueueForCampaign(campaignId: number, workspaceId: string) {
  return deleteCampaignQueueAndEmit({
    conditions: [
      eq(campaignQueueTable.campaign_id, campaignId),
      eq(campaignQueueTable.workspace, workspaceId),
    ],
    workspaceId,
  });
}

export async function deleteCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return deleteCampaignQueueAndEmit({
    conditions,
    workspaceId: args.workspaceId,
  });
}

export async function deleteQueuedUnattemptedCampaignQueueByCampaignAndContactIds(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}) {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
    eq(campaignQueueTable.queue_state, QUEUE_STATUS_QUEUED),
    eq(campaignQueueTable.attempts, 0),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  return deleteCampaignQueueAndEmit({
    conditions,
    workspaceId: args.workspaceId,
  });
}

export async function getCampaignQueueContactIds(
  campaignId: number,
  workspaceId?: string,
): Promise<number[]> {
  const conditions = [eq(campaignQueueTable.campaign_id, campaignId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(and(...conditions));
  return rows.map((row) => row.contact_id);
}

export type DequeuedQueueRow = {
  contact_id: number;
  dequeued_reason: string | null;
};

/**
 * Every campaign_queue row that was dequeued before ever producing a
 * message — landline pre-check, opt-out, duplicate suppression. The SMS
 * export uses this to synthesize skipped rows so customers can see
 * whose message never went out and why.
 *
 * `dequeued_at IS NOT NULL` covers both writer paths — the TS helper
 * (`buildDequeuedQueueUpdate` stamps `dequeued_at` alongside
 * `queue_state = "dequeued"`) and the plpgsql `fail_exhausted…` UPDATE
 * (which stamps `dequeued_at` under `queue_state = "failed"`).
 */
export async function findDequeuedQueueRowsForCampaign(
  campaignId: number,
  workspaceId?: string,
): Promise<DequeuedQueueRow[]> {
  const conditions = [
    eq(campaignQueueTable.campaign_id, campaignId),
    sql`${campaignQueueTable.dequeued_at} IS NOT NULL`,
  ];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }
  const rows = await db
    .select({
      contact_id: campaignQueueTable.contact_id,
      dequeued_reason: campaignQueueTable.dequeued_reason,
    })
    .from(campaignQueueTable)
    .where(and(...conditions));
  return rows;
}

export async function getQueuedContactIdsForCampaign(args: {
  campaignId: number;
  contactIds: number[];
  workspaceId?: string;
}): Promise<number[]> {
  if (args.contactIds.length === 0) {
    return [];
  }

  const conditions = [
    eq(campaignQueueTable.campaign_id, args.campaignId),
    inArray(campaignQueueTable.contact_id, args.contactIds),
  ];
  if (args.workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, args.workspaceId));
  }

  const rows = await db
    .select({ contact_id: campaignQueueTable.contact_id })
    .from(campaignQueueTable)
    .where(and(...conditions));
  return rows.map((row) => row.contact_id);
}


/**
 * Internal mechanism — plain Drizzle UPDATE, unconditional on the row's
 * current queue_state. Not exported: call {@link dequeueQueueEntry} instead
 * (see the note there for why this file, not the caller, owns the mechanism
 * choice).
 */
async function dequeueCampaignQueueById(args: {
  queueId: number;
  userId: string | null;
  reason: string;
  workspaceId: string;
  expectedGeneration?: string | null;
  exec?: QueueWriteExecutor;
  deferEmit?: DeferredEmit;
}) {
  // The workspace predicate belongs to the helper: `campaign_queue` is a
  // workspace-scoped table, so a write without it can reach another tenant.
  const conditions: SQL[] = [
    eq(campaignQueueTable.id, args.queueId),
    eq(campaignQueueTable.workspace, args.workspaceId),
  ];
  conditions.push(matchesQueueGeneration(args.expectedGeneration));

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildDequeuedQueueUpdate(args.userId, args.reason),
    workspaceId: args.workspaceId,
    exec: args.exec,
    deferEmit: args.deferEmit,
  });
}

function matchesQueueGeneration(expected: string | null | undefined): SQL {
  if (expected === undefined) return sql`true`;
  return expected === null ? sql`false` : eq(campaignQueueTable.dispatch_generation, expected);
}


export async function fetchCampaignQueueRowsByIds(queueIds: number[], workspaceId?: string) {
  if (queueIds.length === 0) {
    return [];
  }

  const conditions = [inArray(campaignQueueTable.id, queueIds)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const queueRows = await db
    .select()
    .from(campaignQueueTable)
    .where(and(...conditions));

  if (queueRows.length === 0) {
    return [];
  }

  const contactById = await loadContactsByQueueRows(queueRows);

  return queueRows.map((queueRow) => ({
    ...queueRow,
    contact: contactById.get(queueRow.contact_id) ?? null,
  }));
}

export async function findActiveAssignedQueueForUser(userId: string, workspaceId?: string) {
  const conditions = [
    isNull(campaignQueueTable.dequeued_at),
    eq(campaignQueueTable.assigned_to_user_id, userId),
  ];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const rows = await db
    .select({
      id: campaignQueueTable.id,
      contact_id: campaignQueueTable.contact_id,
      campaign_id: campaignQueueTable.campaign_id,
      assigned_to_user_id: campaignQueueTable.assigned_to_user_id,
      queue_state: campaignQueueTable.queue_state,
      dequeued_at: campaignQueueTable.dequeued_at,
      provider_status: campaignQueueTable.provider_status,
      group_household_queue: campaignTable.group_household_queue,
    })
    .from(campaignQueueTable)
    .innerJoin(campaignTable, eq(campaignQueueTable.campaign_id, campaignTable.id))
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function resolveContactWorkspaceIdFromQueue(
  contactId: number,
  workspaceId?: string,
): Promise<string | null> {
  const conditions = [eq(campaignQueueTable.contact_id, contactId)];
  if (workspaceId) {
    conditions.push(eq(campaignQueueTable.workspace, workspaceId));
  }

  const [row] = await db
    .select({ workspace: campaignQueueTable.workspace })
    .from(campaignQueueTable)
    .where(and(...conditions))
    .limit(1);

  return row?.workspace ?? null;
}

/**
 * Internal mechanism — plain Drizzle UPDATE, unconditional on the row's
 * current queue_state, optionally scoped to one campaign. `userId` may be
 * null for system-initiated dequeues (e.g. inbound SMS STOP). Not exported:
 * call {@link dequeueQueueEntry} instead.
 */
async function dequeueCampaignQueueByContact(args: {
  contactId: number;
  campaignId: number | null;
  userId: string | null;
  reason: string;
  workspaceId: string;
}) {
  const conditions: SQL[] = [
    eq(campaignQueueTable.contact_id, args.contactId),
    eq(campaignQueueTable.workspace, args.workspaceId),
  ];
  if (args.campaignId !== null) {
    conditions.push(eq(campaignQueueTable.campaign_id, args.campaignId));
  }

  return updateCampaignQueueAndEmit({
    conditions,
    set: buildDequeuedQueueUpdate(args.userId, args.reason),
    workspaceId: args.workspaceId,
  });
}

/**
 * Queue dequeues share one entry point. Row IDs identify one queue entry;
 * ordinary contact targets require a campaign. Only opt-out and do-not-call
 * use the explicit `allCampaigns` target to remove all of a contact's rows.
 *
 * `household` omitted uses unconditional Drizzle updates. With `household`
 * true or false, the RPC accepts queued/null rows or the caller's own assigned
 * rows. Preserve that guard: an ambiguous dial failure must park its claim,
 * but must never stop another agent's call after a concurrent reclaim.
 * Household grouping affects only contacts in the selected campaign.
 * A null user can reach only queued/null rows on the guarded path.
 *
 * The result counts the primary contact, not household siblings. A household
 * fan-out that misses the requested contact must not report success to the UI.
 */
type DequeueQueueEntryByIdArgs = {
  by: { id: number };
  userId: string | null;
  reason: string;
  workspaceId: string;
  /** A funded dispatch may finish only its own queue intent. Null refuses the write. */
  expectedGeneration?: string | null;
  household?: undefined;
  /** Run in the caller's transaction, and hold the publish until it commits. */
  exec?: QueueWriteExecutor;
  deferEmit?: DeferredEmit;
};

type DequeueQueueEntryByContactArgs = {
  by: { contactId: number; campaignId: number };
  userId: string | null;
  reason: string;
  workspaceId: string;
  household?: boolean;
  exec?: RpcExecutor;
};

/** Opt-out and do-not-call apply to every campaign, without household fan-out. */
type DequeueQueueEntryAllCampaignsArgs = {
  by: { contactId: number; allCampaigns: true };
  userId: string | null;
  reason: string;
  workspaceId: string;
  household?: undefined;
  exec?: undefined;
};

export type DequeueQueueEntryArgs =
  | DequeueQueueEntryByIdArgs
  | DequeueQueueEntryByContactArgs
  | DequeueQueueEntryAllCampaignsArgs;

/**
 * What the dequeue actually did to the row it was called for.
 *
 * `dequeuedPrimary: false` is not an error — on the guarded RPC path it is the
 * concurrency guard doing its job, and on the Drizzle paths it means the
 * target row no longer exists or is already terminal. Only callers that report
 * an outcome to a human need to look at it; see
 * {@link explainDequeueNoOp} for turning a `false` into a reason.
 *
 * Household siblings are deliberately excluded: a fan-out that dequeues three
 * siblings but misses the contact the agent clicked is still a failed dequeue.
 */
export type DequeueQueueEntryResult = {
  dequeuedPrimary: boolean;
};

// A plain `"id" in args.by` inline check narrows `args.by`'s type but not
// sibling properties of `args` (e.g. `userId`) back at the call site — a
// named type predicate narrows the whole `args` union instead.
function isByIdArgs(args: DequeueQueueEntryArgs): args is DequeueQueueEntryByIdArgs {
  return "id" in args.by;
}

/**
 * Record a failed dispatch attempt on a queued row so the exhaustion sweep
 * (`fail_exhausted_campaign_queue_contacts`) can dead-letter it once the
 * policy maximum is reached, instead of leaving it queued forever.
 * The live-call claim path bumps `attempt_count` inside its claim RPC; the
 * SMS and IVR dispatch loops never claim, so they record here.
 */
export async function recordQueueAttemptFailure(args: {
  queueId: number;
  error: string;
  workspaceId: string;
  expectedGeneration?: string | null;
}): Promise<void> {
  await updateCampaignQueueAndEmit({
    conditions: [
      eq(campaignQueueTable.id, args.queueId),
      eq(campaignQueueTable.workspace, args.workspaceId),
      isNull(campaignQueueTable.dequeued_at),
      matchesQueueGeneration(args.expectedGeneration),
    ],
    set: {
      attempt_count: sql`${campaignQueueTable.attempt_count} + 1`,
      last_attempt_at: new Date(),
      last_attempt_error: args.error.slice(0, 500),
    },
    workspaceId: args.workspaceId,
  });
}

export async function dequeueQueueEntry(
  args: DequeueQueueEntryArgs,
): Promise<DequeueQueueEntryResult> {
  if (isByIdArgs(args)) {
    // Defence in depth behind the type: a by-id dequeue without a workspace
    // would select a row of any tenant, because the row id alone is not a
    // tenant boundary.
    if (!args.workspaceId) {
      throw new Error(
        "dequeueQueueEntry: workspaceId is required for a by-id dequeue",
      );
    }
    const rows = await dequeueCampaignQueueById({
      queueId: args.by.id,
      userId: args.userId,
      reason: args.reason,
      workspaceId: args.workspaceId,
      expectedGeneration: args.expectedGeneration,
      exec: args.exec,
      deferEmit: args.deferEmit,
    });
    await completeCampaignsDrainedByDequeue(
      rows,
      args.workspaceId ?? rows[0]?.workspace,
      args.exec,
    );
    return { dequeuedPrimary: rows.length > 0 };
  }

  if ("allCampaigns" in args.by) {
    if (args.by.allCampaigns !== true) {
      throw new Error("dequeueQueueEntry: allCampaigns must be explicitly true");
    }
    const rows = await dequeueCampaignQueueByContact({
      contactId: args.by.contactId,
      campaignId: null,
      userId: args.userId,
      reason: args.reason,
      workspaceId: args.workspaceId,
    });
    await completeCampaignsDrainedByDequeue(rows, args.workspaceId);
    return { dequeuedPrimary: rows.length > 0 };
  }

  const { contactId, campaignId } = args.by;
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
    throw new Error("dequeueQueueEntry: a valid campaignId is required");
  }

  if (args.household !== undefined) {
    if (!args.workspaceId) {
      throw new Error(
        "dequeueQueueEntry: workspaceId is required for the household-aware RPC mechanism",
      );
    }
    const exec = args.exec ?? createTenantDb(args.workspaceId);
    const primaryRowsDequeued = await rpcDequeueContact(exec, {
      contactId,
      campaignId,
      workspaceId: args.workspaceId,
      groupOnHousehold: args.household,
      dequeuedById: args.userId,
      dequeuedReasonText: args.reason,
    });
    if (primaryRowsDequeued > 0) {
      await tryCompleteDrainedCampaigns([campaignId], exec, args.workspaceId);
    }
    return { dequeuedPrimary: primaryRowsDequeued > 0 };
  }

  const rows = await dequeueCampaignQueueByContact({
    contactId,
    campaignId,
    userId: args.userId,
    reason: args.reason,
    workspaceId: args.workspaceId,
  });
  await completeCampaignsDrainedByDequeue(rows, args.workspaceId ?? rows[0]?.workspace);
  return { dequeuedPrimary: rows.length > 0 };
}


export { explainDequeueNoOp, type DequeueNoOpReason } from "@/lib/campaign-queue-dequeue-result.server";

export async function releaseAssignedQueueForUser(
  userId: string,
  campaignId: string | number,
  workspaceId: string,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  try {
    const conditions: SQL[] = [
      eq(campaignQueueTable.campaign_id, Number(campaignId)),
      eq(campaignQueueTable.workspace, workspaceId),
      eq(campaignQueueTable.assigned_to_user_id, userId),
      eq(campaignQueueTable.queue_state, QUEUE_LIFECYCLE_ASSIGNED),
      isNull(campaignQueueTable.dequeued_at),
      isNull(campaignQueueTable.dequeued_by),
      isNull(campaignQueueTable.dequeued_reason),
      isNull(campaignQueueTable.provider_status),
      sql`exists (select 1 from ${contactTable}
        where ${contactTable.id} = ${campaignQueueTable.contact_id}
          and ${contactTable.workspace} = ${campaignQueueTable.workspace}
          and ${contactTable.opt_out} is not true)`,
    ];
    const released = await updateCampaignQueueAndEmit({
      conditions,
      set: buildQueuedQueueUpdate(),
      workspaceId,
    });

    return { ok: true, released: released.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to release assigned queue rows",
    };
  }
}
