import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/database.types";
import {
  agent_status as agentStatusTable,
  agent_status_event as agentStatusEventTable,
} from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

type AgentState = Database["public"]["Enums"]["agent_state"];
type AgentStatusRow = typeof agentStatusTable.$inferSelect;

export type AgentStatusResult = AgentStatusRow | null;

export type AgentStatusTransition = {
  from: AgentState;
  to: AgentState;
  reason?: string | null;
};

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  offline: ["available", "away"],
  available: ["busy", "away", "offline", "wrap_up"],
  busy: ["wrap_up", "away", "offline"],
  wrap_up: ["available", "away", "offline"],
  away: ["available", "offline"],
};

function isValidTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function getAgentStatus(
  workspaceId: string,
  userId: string,
  tdbIn?: TenantDb,
): Promise<AgentStatusResult> {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const row = (await tdb.agent_status.findFirst({
    where: and(
      eq(agentStatusTable.user_id, userId),
    ),
  })) as AgentStatusRow | undefined;
  return row ?? null;
}

async function upsertAgentStatusRow(args: {
  tdb: TenantDb;
  workspaceId: string;
  userId: string;
  to: AgentState;
  reason?: string | null;
  statusStartedAt: string;
  now: string;
}): Promise<AgentStatusRow | { error: string }> {
  const existing = await getAgentStatus(args.workspaceId, args.userId, args.tdb);
  const rowValues = {
    user_id: args.userId,
    status: args.to,
    status_reason: args.reason ?? null,
    status_started_at: args.statusStartedAt,
    last_heartbeat_at: args.now,
    updated_at: args.now,
  };

  if (existing) {
    const rows = await args.tdb.agent_status.update({
      set: rowValues,
      where: and(eq(agentStatusTable.user_id, args.userId)),
    });
    const updated = rows[0] as AgentStatusRow | undefined;
    if (!updated) return { error: "Failed to update agent status" };
    return updated;
  }

  const rows = await args.tdb.agent_status.insert(rowValues);
  const inserted = rows[0] as AgentStatusRow | undefined;
  if (!inserted) return { error: "Failed to insert agent status" };
  return inserted;
}

export async function updateAgentStatus(
  workspaceId: string,
  userId: string,
  to: AgentState,
  reason?: string | null,
  tdbIn?: TenantDb,
): Promise<
  { status: AgentStatusRow; transition: AgentStatusTransition } | { error: string }
> {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  const current = await getAgentStatus(workspaceId, userId, tdb);
  const from = (current?.status ?? "offline") as AgentState;
  const now = new Date().toISOString();

  if (from === to) {
    if (!current) {
      return { error: "Agent status row missing" };
    }
    const result = await upsertAgentStatusRow({
      tdb,
      workspaceId,
      userId,
      to,
      reason,
      statusStartedAt: current.status_started_at,
      now,
    });
    if ("error" in result) return result;
    return { status: result, transition: { from, to, reason } };
  }

  if (!isValidTransition(from, to)) {
    return { error: `Invalid transition: ${from} → ${to}` };
  }

  const result = await upsertAgentStatusRow({
    tdb,
    workspaceId,
    userId,
    to,
    reason,
    statusStartedAt: now,
    now,
  });
  if ("error" in result) return result;

  await tdb.agent_status_event.insert({
    user_id: userId,
    from_status: from,
    to_status: to,
    reason: reason ?? null,
    created_at: now,
  });

  return { status: result, transition: { from, to, reason } };
}

export async function heartbeatAgentStatus(
  workspaceId: string,
  userId: string,
  tdbIn?: TenantDb,
): Promise<void> {
  const tdb = tdbIn ?? createTenantDb(workspaceId);
  await tdb.agent_status.update({
    set: { last_heartbeat_at: new Date().toISOString() },
    where: and(eq(agentStatusTable.user_id, userId)),
  });
}
