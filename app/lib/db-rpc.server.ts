import { sql, type SQL } from "drizzle-orm";
import { rowsToCsv } from "@/lib/rpc-csv.server";
import { db, type Database as DbInstance } from "@/server/db";
import { withAppCurrentUser } from "@/server/tenant-db";

export type RpcExecutor = typeof db | DbInstance;

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
  const id = await queryScalar<number>(
    executor,
    sql`select create_outreach_attempt(
      ${args.contactId}::bigint,
      ${args.campaignId}::bigint,
      ${args.userId}::uuid,
      ${args.workspaceId}::uuid,
      ${args.queueId}::bigint
    ) as id`,
  );
  if (id == null) {
    throw new Error("create_outreach_attempt returned no id");
  }
  return id;
}

export async function rpcDequeueContact(
  executor: RpcExecutor,
  args: {
    contactId: number;
    groupOnHousehold: boolean;
    dequeuedById?: string | null;
    dequeuedReasonText?: string | null;
  },
): Promise<void> {
  await execVoid(
    executor,
    sql`select dequeue_contact(
      ${args.contactId}::bigint,
      ${args.groupOnHousehold},
      ${args.dequeuedById ?? null}::uuid,
      ${args.dequeuedReasonText ?? null}
    )`,
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
  return queryRows<CampaignStatRow>(
    executor,
    sql`select * from get_campaign_stats(${Number(campaignId)})`,
  );
}

export async function rpcResetCampaign(
  executor: RpcExecutor,
  campaignId: number,
): Promise<void> {
  await execVoid(executor, sql`select reset_campaign(${campaignId})`);
}

export async function rpcCancelOutreachAttemptsByCallIds(
  executor: RpcExecutor,
  callIds: number[],
): Promise<void> {
  if (callIds.length === 0) return;
  await execVoid(
    executor,
    sql`select cancel_outreach_attempts(${callIds}::bigint[])`,
  );
}

export async function rpcCancelMessages(
  executor: RpcExecutor,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  await execVoid(
    executor,
    sql`select cancel_messages(${messageIds}::uuid[])`,
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
  return queryRows(
    db,
    sql`select * from find_contact_by_phone(${phoneNumber}, ${workspaceId}::uuid)`,
  );
}

export async function rpcFindContactsByPhones(
  workspaceId: string,
  phoneNumbers: string[],
): Promise<Record<string, unknown>[]> {
  if (phoneNumbers.length === 0) return [];
  return queryRows(
    db,
    sql`select * from find_contacts_by_phones(${phoneNumbers}, ${workspaceId}::uuid)`,
  );
}

export async function rpcGetAudiencesByCampaign(
  campaignId: number,
): Promise<{ data: AudienceByCampaignRow[]; error: null } | { data: null; error: Error }> {
  try {
    const data = await queryRows<AudienceByCampaignRow>(
      db,
      sql`select * from get_audiences_by_campaign(${campaignId})`,
    );
    return { data, error: null };
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
  const startOrder = await queryScalar<number>(
    executor,
    sql`select reserve_campaign_queue_order_range(
      ${args.campaignId},
      ${args.count}
    ) as start_order`,
  );
  if (typeof startOrder !== "number" || !Number.isFinite(startOrder)) {
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
