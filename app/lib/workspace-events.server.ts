import { and, asc, eq, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";
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
