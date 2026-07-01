/** Client-safe workspace event types for SSE consumers. */

export type PostgresChangePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  table: string;
  schema?: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type WorkspaceEventRecord = {
  id: number;
  workspace_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type RealtimeChangePayload<T extends Record<string, unknown> = Record<string, unknown>> =
  PostgresChangePayload & {
    new: T | null;
    old: T | null;
  };

export function parseWorkspaceEventData(raw: string): WorkspaceEventRecord {
  return JSON.parse(raw) as WorkspaceEventRecord;
}

export function matchesPostgresChangeFilter(
  payload: PostgresChangePayload,
  filter?: string,
): boolean {
  if (!filter) return true;

  const match = filter.match(/^(\w+)=eq\.(.+)$/);
  if (!match) return true;

  const [, column, expected] = match;
  if (!column) return true;
  const row =
    payload.eventType === "DELETE"
      ? payload.old
      : payload.new;

  if (!row) return false;
  return String(row[column] ?? "") === expected;
}
