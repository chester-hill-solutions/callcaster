import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { rowsToCsv } from "@/lib/rpc-csv.server";
import { QUEUE_STATUS_QUEUED } from "@/lib/queue-status";
import { emitQueueEvent } from "@/lib/workspace-events.server";
import { campaign_queue as campaignQueueTable, contact as contactTable } from "@/db/schema";
import { db, type Database as DbInstance } from "@/server/db";
import { withAppCurrentUser } from "@/server/tenant-db";

export type RpcExecutor = { execute: (query: SQL) => Promise<unknown[]> };

async function queryRows<T extends Record<string, unknown>>(
  executor: RpcExecutor,
  query: SQL,
): Promise<T[]> {
  return (await executor.execute(query)) as T[];
}

async function queryScalar<T>(
  executor: RpcExecutor,
  query: SQL,
): Promise<T | null> {
  const rows = await queryRows<Record<string, T>>(executor, query);
  const first = rows[0];
  if (!first) return null;
  const value = Object.values(first)[0];
  return value ?? null;
}

/**
 * Scalar RPC result coerced to a finite number. Postgres `bigint` (int8)
 * comes back from the driver as a string — postgres.js only auto-parses
 * int2/int4/oid/float — so a `RETURNS bigint` function silently fails
 * `typeof === "number"` / `Number.isFinite` checks downstream (#1218).
 */
async function queryScalarNumber(
  executor: RpcExecutor,
  query: SQL,
  label: string,
): Promise<number | null> {
  const raw = await queryScalar<number | string>(executor, query);
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} returned a non-numeric value: ${String(raw)}`);
  }
  return value;
}

/**
 * Coerce named columns of raw-SQL rows to finite numbers. Same driver quirk
 * as queryScalarNumber: bigint/numeric arrive as strings from postgres.js,
 * and downstream `typeof === "number"` checks silently drop them
 * (#1225/#1226/#1227). Non-finite values become null rather than NaN.
 */
function coerceRowNumbers<T extends Record<string, unknown>>(
  rows: T[],
  keys: ReadonlyArray<string>,
): T[] {
  return rows.map((row) => {
    const patched: Record<string, unknown> = { ...row };
    for (const key of keys) {
      if (patched[key] == null) continue;
      const value = Number(patched[key]);
      patched[key] = Number.isFinite(value) ? value : null;
    }
    return patched as T;
  });
}

async function execVoid(executor: RpcExecutor, query: SQL): Promise<void> {
  await executor.execute(query);
}

export type AutoDialQueueRow = {
  contact_id: number;
  queue_id: number;
  caller_id: string;
  contact_phone: string;
};

export type CampaignQueueRow = {
  id: number;
  contact_id: number;
  phone: string;
  workspace: string;
  caller_id: string;
};

export type CampaignStatRow = {
  disposition: string;
  count: number;
  average_call_duration: unknown;
  average_wait_time: unknown;
  expected_total: number;
};

export type AudienceByCampaignRow = {
  created_at: string;
  id: number;
  is_conditional: boolean;
  name: string | null;
  workspace: string | null;
};

export type WorkspaceUserRow = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  user_workspace_role: string;
};

export type SelectQueueContactRow = {
  queue_id: number;
  contact_id: number;
};

export async function rpcAutoDialQueue(
  executor: RpcExecutor,
  args: { campaignId: number; userId: string },
): Promise<AutoDialQueueRow | null> {
  const rows = await queryRows<AutoDialQueueRow>(
    executor,
    sql`select * from auto_dial_queue(${args.campaignId}, ${args.userId}::uuid)`,
  );
  return rows[0] ?? null;
}

/**
 * Mark a campaign complete when its queue has drained. Returns whether it did.
 *
 * The function re-checks `campaign_queue_has_pending_work` itself and only
 * updates active campaigns, so calling it opportunistically is safe: a contact
 * released back to `queued` (out of the recipient calling window, say) still
 * counts as pending and will not be mistaken for a drained queue.
 */
/**
 * Return stale `assigned` rows to `queued` for one campaign, and fail contacts
 * past max_attempts. Returns how many claims were reset.
 *
 * A claim is only undone by the dial path that made it, so a turn that dies
 * between claiming and dialling strands the row. Nothing in the live code
 * called this: its only caller was the dead Supabase-shaped campaign-dispatch
 * module, so stranded rows were never recovered — and because
 * campaign_queue_has_pending_work stops counting an assigned row once its
 * claim goes stale, the campaign then reported itself drained with contacts
 * still undialled.
 */
export async function rpcResetStaleCampaignQueueClaims(
  executor: RpcExecutor,
  campaignId: number,
): Promise<number> {
  const rows = await queryRows<{ reset_count: number }>(
    executor,
    sql`select reset_stale_campaign_queue_claims(${campaignId}, NULL) as reset_count`,
  );
  return Number(rows[0]?.reset_count ?? 0);
}

export async function rpcTryCompleteCampaignIfDrained(
  executor: RpcExecutor,
  campaignId: number,
): Promise<boolean> {
  const rows = await queryRows<{ completed: boolean }>(
    executor,
    sql`select try_complete_campaign_if_drained(${campaignId}) as completed`,
  );
  return rows[0]?.completed ?? false;
}

export async function rpcCreateOutreachAttempt(
  executor: RpcExecutor,
  args: {
    contactId: number;
    campaignId: number;
    userId: string;
    workspaceId: string;
    queueId: number;
  },
): Promise<number> {
  const id = await queryScalarNumber(
    executor,
    sql`select create_outreach_attempt(
      ${args.contactId}::bigint,
      ${args.campaignId}::bigint,
      ${args.userId}::uuid,
      ${args.workspaceId}::uuid,
      ${args.queueId}::bigint
    ) as id`,
    "create_outreach_attempt",
  );
  if (id == null) {
    throw new Error("create_outreach_attempt returned no id");
  }
  return id;
}

export type DialClaimResult =
  | "claimed"
  | "unavailable"
  | "claimed_by_other"
  | "not_queued"
  | "active_call";

/**
 * Atomically claim a specific queue row before dialing it (manual dial path).
 * Anything but "claimed" means the dial must not proceed — see
 * client/migrations/20260805120000_atomic_manual_dial_claims.sql for the
 * exact semantics of each refusal code.
 */
export async function rpcClaimQueueEntryForDial(
  executor: RpcExecutor,
  args: {
    queueId: number;
    campaignId: number;
    workspaceId: string;
    userId: string;
  },
): Promise<DialClaimResult> {
  const result = await queryScalar<string>(
    executor,
    sql`select claim_queue_entry_for_dial(
      ${args.queueId}::bigint,
      ${args.campaignId}::bigint,
      ${args.workspaceId}::uuid,
      ${args.userId}::uuid
    ) as result`,
  );
  return (result ?? "unavailable") as DialClaimResult;
}

/**
 * Household-aware dequeue mechanism (issue #1240 B3). Exported only so
 * app/lib/campaign-queue-db.server.ts's `dequeueQueueEntry` — the single
 * caller-facing dequeue entry point — can import it across the module
 * boundary; no other file should call this directly. Call
 * `dequeueQueueEntry` instead.
 */
export async function rpcDequeueContact(
  executor: RpcExecutor,
  args: {
    contactId: number;
    workspaceId: string;
    groupOnHousehold: boolean;
    dequeuedById?: string | null;
    dequeuedReasonText?: string | null;
  },
): Promise<void> {
  const contactIds = new Set<number>([args.contactId]);
  if (args.groupOnHousehold) {
    const [sourceContact] = await db
      .select({ household_id: contactTable.household_id })
      .from(contactTable)
      .where(
        and(
          eq(contactTable.id, args.contactId),
          eq(contactTable.workspace, args.workspaceId),
        ),
      )
      .limit(1);
    if (sourceContact?.household_id != null) {
      const householdContacts = await db
        .select({ id: contactTable.id })
        .from(contactTable)
        .where(
          and(
            eq(contactTable.household_id, sourceContact.household_id),
            eq(contactTable.workspace, args.workspaceId),
          ),
        );
      for (const row of householdContacts) {
        contactIds.add(row.id);
      }
    }
  }

  const oldRows = await db
    .select()
    .from(campaignQueueTable)
    .where(
      and(
        inArray(campaignQueueTable.contact_id, [...contactIds]),
        eq(campaignQueueTable.workspace, args.workspaceId),
        isNull(campaignQueueTable.dequeued_at),
        or(
          isNull(campaignQueueTable.queue_state),
          eq(campaignQueueTable.queue_state, QUEUE_STATUS_QUEUED),
        ),
      ),
    );

  await execVoid(
    executor,
    sql`select dequeue_contact(
      ${args.contactId}::bigint,
      ${args.groupOnHousehold},
      ${args.workspaceId}::uuid,
      ${args.dequeuedById ?? null}::uuid,
      ${args.dequeuedReasonText ?? null}
    )`,
  );

  if (oldRows.length === 0) {
    return;
  }

  const newRows = await db
    .select()
    .from(campaignQueueTable)
    .where(inArray(campaignQueueTable.id, oldRows.map((row) => row.id)));

  const oldById = new Map(oldRows.map((row) => [row.id, row]));
  await Promise.all(
    newRows
      .filter((row) => row.dequeued_at != null)
      .map((newRow) =>
        emitQueueEvent(
          newRow.workspace,
          "UPDATE",
          newRow as Record<string, unknown>,
          (oldById.get(newRow.id) ?? null) as Record<string, unknown> | null,
        ),
      ),
  );
}

export async function rpcGetCampaignQueue(
  executor: RpcExecutor,
  campaignId: number,
): Promise<CampaignQueueRow[]> {
  return queryRows<CampaignQueueRow>(
    executor,
    sql`select * from get_campaign_queue(${campaignId})`,
  );
}

export async function rpcGetCampaignStats(
  executor: RpcExecutor,
  campaignId: number | string,
): Promise<CampaignStatRow[]> {
  const rows = await queryRows<CampaignStatRow>(
    executor,
    sql`select * from get_campaign_stats(${Number(campaignId)})`,
  );
  return coerceRowNumbers(rows, ["count", "expected_total"]);
}

export async function rpcResetCampaign(
  executor: RpcExecutor,
  campaignId: number,
): Promise<void> {
  await execVoid(executor, sql`select reset_campaign(${campaignId})`);
}

export async function rpcCancelOutreachAttemptsByCallSids(
  executor: RpcExecutor,
  callSids: string[],
): Promise<void> {
  if (callSids.length === 0) return;
  await execVoid(
    executor,
    sql`select cancel_outreach_attempts(${callSids}::text[])`,
  );
}

export async function rpcCancelMessages(
  executor: RpcExecutor,
  messageSids: string[],
): Promise<void> {
  if (messageSids.length === 0) return;
  await execVoid(
    executor,
    sql`select cancel_messages(${messageSids}::text[])`,
  );
}

export async function rpcCreateNewWorkspace(
  workspaceName: string,
  userId: string,
): Promise<string> {
  const id = await queryScalar<string>(
    db,
    sql`select create_new_workspace(${workspaceName}, ${userId}::uuid) as id`,
  );
  if (!id) {
    throw new Error("create_new_workspace returned no id");
  }
  return id;
}

export async function rpcGetWorkspaceUsers(
  workspaceId: string,
): Promise<WorkspaceUserRow[]> {
  return queryRows<WorkspaceUserRow>(
    db,
    sql`select * from get_workspace_users(${workspaceId}::uuid)`,
  );
}

export async function rpcUpdateUserWorkspaceLastAccessTime(
  userId: string,
  workspaceId: string,
): Promise<void> {
  await withAppCurrentUser(userId, async (tx) => {
    await execVoid(
      tx,
      sql`select update_user_workspace_last_access_time(${workspaceId}::uuid)`,
    );
  });
}

export async function rpcFindContactByPhone(
  workspaceId: string,
  phoneNumber: string,
): Promise<Record<string, unknown>[]> {
  const rows = await queryRows(
    db,
    sql`select * from find_contact_by_phone(${phoneNumber}, ${workspaceId}::uuid)`,
  );
  return coerceRowNumbers(rows, ["id"]);
}

export async function rpcFindContactsByPhones(
  workspaceId: string,
  phoneNumbers: string[],
): Promise<Record<string, unknown>[]> {
  if (phoneNumbers.length === 0) return [];
  const rows = await queryRows(
    db,
    sql`select * from find_contacts_by_phones(${workspaceId}::uuid, array[${sql.join(
      phoneNumbers.map((phone) => sql`${phone}`),
      sql`, `,
    )}]::text[])`,
  );
  return coerceRowNumbers(rows, ["id"]);
}

export async function rpcGetAudiencesByCampaign(
  campaignId: number,
): Promise<{ data: AudienceByCampaignRow[]; error: null } | { data: null; error: Error }> {
  try {
    const data = await queryRows<AudienceByCampaignRow>(
      db,
      sql`select * from get_audiences_by_campaign(${campaignId})`,
    );
    return { data: coerceRowNumbers(data, ["id"]), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export async function rpcGetCampaignMessagesCsv(
  workspaceId: string,
  campaignId: number,
): Promise<string> {
  const rows = await queryRows<Record<string, unknown>>(
    db,
    sql`select * from get_campaign_messages(${workspaceId}::uuid, ${campaignId})`,
  );
  return rowsToCsv(rows);
}

export async function rpcGetCampaignAttemptsCsv(
  campaignId: number,
): Promise<string> {
  const rows = await queryRows<Record<string, unknown>>(
    db,
    sql`select * from get_campaign_attempts(${campaignId})`,
  );
  return rowsToCsv(rows);
}

export async function rpcReserveCampaignQueueOrderRange(
  executor: RpcExecutor,
  args: { campaignId: number; count: number },
): Promise<number> {
  const startOrder = await queryScalarNumber(
    executor,
    sql`select reserve_campaign_queue_order_range(
      ${args.campaignId},
      ${args.count}
    ) as start_order`,
    "reserve_campaign_queue_order_range",
  );
  if (startOrder == null) {
    throw new Error(
      `Invalid start queue order returned for campaign ${args.campaignId}`,
    );
  }
  return startOrder;
}

export async function rpcHandleCampaignQueueEntry(
  executor: RpcExecutor,
  args: {
    contactId: number;
    campaignId: number;
    queueOrder: number;
    requeue: boolean;
  },
): Promise<void> {
  await execVoid(
    executor,
    sql`select handle_campaign_queue_entry(
      ${args.contactId}::bigint,
      ${args.campaignId},
      ${args.queueOrder},
      ${args.requeue}
    )`,
  );
}

export async function rpcSelectAndUpdateCampaignContacts(
  userId: string,
  args: { campaignId: number; limit: number },
): Promise<SelectQueueContactRow[]> {
  return withAppCurrentUser(userId, async (tx) =>
    queryRows<SelectQueueContactRow>(
      tx,
      sql`select * from select_and_update_campaign_contacts(
        ${args.campaignId},
        ${args.limit}
      )`,
    ),
  );
}

export type InboundQueueClaimRow = {
  agent_user_id: string;
  entry_id: number;
};

export type InboundQueueOfferRow = {
  call_sid: string;
  entry_id: number;
};

/**
 * Release inbound offers whose status callback never arrived, returning the
 * count. Each release also returns its agent to `available`.
 *
 * Claiming sets the agent to `busy`; only the Twilio status callback undoes
 * that. A lost callback therefore removes an agent from inbound routing
 * permanently, so this runs before each claim.
 */
export async function rpcResetStaleInboundOffers(
  executor: RpcExecutor,
): Promise<number> {
  const rows = await queryRows<{ released: number }>(
    executor,
    sql`select reset_stale_inbound_offers() as released`,
  );
  return Number(rows[0]?.released ?? 0);
}

export async function rpcClaimInboundQueueEntry(
  executor: RpcExecutor,
  args: {
    queueId: number;
    workspaceId: string;
    callSid: string;
    callerNumber: string;
  },
): Promise<InboundQueueClaimRow | null> {
  const rows = await queryRows<InboundQueueClaimRow>(
    executor,
    sql`select * from claim_inbound_queue_entry(
      ${args.queueId},
      ${args.workspaceId}::uuid,
      ${args.callSid},
      ${args.callerNumber}
    )`,
  );
  return rows[0] ?? null;
}

export async function rpcReleaseInboundOffer(
  executor: RpcExecutor,
  args: { entryId: number; outcome?: "timed_out" | "declined" },
): Promise<void> {
  await execVoid(
    executor,
    sql`select release_inbound_offer(
      ${args.entryId},
      ${args.outcome ?? "timed_out"}
    )`,
  );
}

export async function rpcAcceptInboundOffer(
  executor: RpcExecutor,
  entryId: number,
): Promise<void> {
  await execVoid(executor, sql`select accept_inbound_offer(${entryId})`);
}

export async function rpcCompleteInboundQueueEntry(
  executor: RpcExecutor,
  entryId: number,
): Promise<void> {
  await execVoid(executor, sql`select complete_inbound_queue_entry(${entryId})`);
}

export async function rpcAbandonInboundQueueEntry(
  executor: RpcExecutor,
  entryId: number,
): Promise<void> {
  await execVoid(executor, sql`select abandon_inbound_queue_entry(${entryId})`);
}

export async function rpcNextInboundQueueOffer(
  executor: RpcExecutor,
  args: { queueId: number; agentUserId: string; workspaceId: string },
): Promise<InboundQueueOfferRow | null> {
  const rows = await queryRows<InboundQueueOfferRow>(
    executor,
    sql`select * from next_inbound_queue_offer(
      ${args.queueId},
      ${args.agentUserId}::uuid,
      ${args.workspaceId}::uuid
    )`,
  );
  return rows[0] ?? null;
}
