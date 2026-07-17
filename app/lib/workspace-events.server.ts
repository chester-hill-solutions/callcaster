import { and, asc, eq, gt , sql } from "drizzle-orm";
import { workspace_events } from "@/db/schema";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";
import { dbDirect } from "@/server/db";

export const WORKSPACE_EVENTS_NOTIFY_CHANNEL = "workspace_events";

export type InsertWorkspaceEventOptions = {
  notify?: boolean;
};

export type WorkspaceEventRow = typeof workspace_events.$inferSelect;

export async function insertWorkspaceEvent(
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
  options: InsertWorkspaceEventOptions = {},
): Promise<WorkspaceEventRow> {
  const notify = options.notify !== false;
  const createdAt = new Date().toISOString();

  return dbDirect.transaction(async (tx) => {
    const [event] = await tx
      .insert(workspace_events)
      .values({
        workspace_id: workspaceId,
        event_type: eventType,
        payload,
        created_at: createdAt,
      })
      .returning();

    if (!event) {
      throw new Error("Failed to insert workspace event");
    }

    if (notify) {
      await tx.execute(
        sql`select pg_notify(${WORKSPACE_EVENTS_NOTIFY_CHANNEL}, ${JSON.stringify({
          workspace_id: workspaceId,
          id: event.id,
        })})`,
      );
    }

    return event;
  });
}

export async function emitPostgresChangeEvent(
  workspaceId: string,
  change: PostgresChangePayload,
): Promise<WorkspaceEventRow> {
  return insertWorkspaceEvent(workspaceId, "postgres_change", {
    eventType: change.eventType,
    table: change.table,
    schema: change.schema ?? "public",
    new: change.new,
    old: change.old,
  });
}

type RealtimeRow = Record<string, unknown>;

function serializeRealtimeRow(row: RealtimeRow): RealtimeRow {
  const out: RealtimeRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function toRealtimeRow(row: RealtimeRow | null | undefined): RealtimeRow | null {
  if (!row) return null;
  return serializeRealtimeRow(row);
}

export async function emitChatMessageEvent(
  workspaceId: string,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  newRow: RealtimeRow | null,
  oldRow?: RealtimeRow | null,
): Promise<WorkspaceEventRow> {
  return emitPostgresChangeEvent(workspaceId, {
    eventType,
    table: "message",
    schema: "public",
    new: toRealtimeRow(newRow),
    old: toRealtimeRow(oldRow ?? null),
  });
}

export async function emitQueueEvent(
  workspaceId: string,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  newRow: RealtimeRow | null,
  oldRow?: RealtimeRow | null,
): Promise<WorkspaceEventRow> {
  return emitPostgresChangeEvent(workspaceId, {
    eventType,
    table: "campaign_queue",
    schema: "public",
    new: toRealtimeRow(newRow),
    old: toRealtimeRow(oldRow ?? null),
  });
}

export async function emitCampaignStatusEvent(
  workspaceId: string,
  newRow: RealtimeRow,
  oldRow?: RealtimeRow | null,
): Promise<WorkspaceEventRow> {
  return emitPostgresChangeEvent(workspaceId, {
    eventType: "UPDATE",
    table: "campaign",
    schema: "public",
    new: toRealtimeRow(newRow),
    old: toRealtimeRow(oldRow ?? null),
  });
}

/**
 * Emit a workspace SSE postgres_change for a newly inserted ledger row.
 * Callers must only invoke this when the ledger RPC returned `inserted: true`.
 */
export async function emitTransactionHistoryInsertEvent(
  workspaceId: string,
  newRow: RealtimeRow,
): Promise<WorkspaceEventRow> {
  return emitPostgresChangeEvent(workspaceId, {
    eventType: "INSERT",
    table: "transaction_history",
    schema: "public",
    new: toRealtimeRow(newRow),
    old: null,
  });
}

export async function emitPredictiveBroadcast(
  workspaceId: string,
  payload: { contact_id: number | null; status: string },
): Promise<WorkspaceEventRow> {
  return insertWorkspaceEvent(workspaceId, "predictive_broadcast", payload);
}

export async function fetchWorkspaceEventsAfter(
  workspaceId: string,
  afterId: number,
  limit = 100,
): Promise<WorkspaceEventRow[]> {
  return dbDirect
    .select()
    .from(workspace_events)
    .where(
      and(
        eq(workspace_events.workspace_id, workspaceId),
        gt(workspace_events.id, afterId),
      ),
    )
    .orderBy(asc(workspace_events.id))
    .limit(limit);
}
