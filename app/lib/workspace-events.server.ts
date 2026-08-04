import { and, asc, desc, eq, gt , sql } from "drizzle-orm";
import { workspace_events } from "@/db/schema";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";
import { logger } from "@/lib/logger.server";
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
): Promise<WorkspaceEventRow | null> {
  // Best-effort realtime notification. A failed workspace_events insert must
  // never convert an already-committed mutation (campaign status, queue, chat)
  // into a user-facing error — realtime freshness is secondary to the write
  // that already landed. Log loudly so a broken SSE channel is still visible.
  try {
    return await insertWorkspaceEvent(workspaceId, "postgres_change", {
      eventType: change.eventType,
      table: change.table,
      schema: change.schema ?? "public",
      new: change.new,
      old: change.old,
    });
  } catch (error) {
    logger.error("workspace postgres_change emission failed", {
      workspaceId,
      table: change.table,
      eventType: change.eventType,
      error,
    });
    return null;
  }
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
): Promise<WorkspaceEventRow | null> {
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
): Promise<WorkspaceEventRow | null> {
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
): Promise<WorkspaceEventRow | null> {
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
): Promise<WorkspaceEventRow | null> {
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
): Promise<WorkspaceEventRow | null> {
  // Best-effort: a failed broadcast must not break the committed call/webhook
  // side-effect that triggered it.
  try {
    return await insertWorkspaceEvent(workspaceId, "predictive_broadcast", payload);
  } catch (error) {
    logger.error("workspace predictive_broadcast emission failed", {
      workspaceId,
      contactId: payload.contact_id,
      error,
    });
    return null;
  }
}

/**
 * Newest event id for a workspace, or 0 when it has none.
 *
 * A fresh SSE connection resumes from here rather than from 0. Starting at 0
 * replays the workspace's entire history to a client whose state was just
 * built by loaders — so old row changes get re-applied over current data, and
 * the replay grows without bound because this log is append-only.
 */
export async function getLatestWorkspaceEventId(workspaceId: string): Promise<number> {
  const [row] = await dbDirect
    .select({ id: workspace_events.id })
    .from(workspace_events)
    .where(eq(workspace_events.workspace_id, workspaceId))
    .orderBy(desc(workspace_events.id))
    .limit(1);
  return row?.id ?? 0;
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
