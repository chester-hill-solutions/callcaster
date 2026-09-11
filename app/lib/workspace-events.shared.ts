/** Client-safe workspace event types for SSE consumers. */
import { z } from "zod";

export type PostgresChangePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  table: string;
  schema?: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export const WorkspaceEventRecord = z.object({
  id: z.number(),
  workspace_id: z.string(),
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

export type WorkspaceEventRecord = z.infer<typeof WorkspaceEventRecord>;

export type RealtimeChangePayload<T extends object = Record<string, unknown>> =
  PostgresChangePayload & {
    new: T | null;
    old: T | null;
  };

/** Envelope shape with a caller-named payload contract. */
export interface WorkspaceEventData<TPayload = Record<string, unknown>> {
  id: number;
  workspace_id: string;
  event_type: string;
  payload: TPayload;
  created_at: string;
}

/**
 * Parse an SSE `data:` frame. Throws on malformed JSON *or* a frame that is not
 * a workspace-event envelope; existing callers already wrap this in try/catch.
 * Prefer {@link safeParseWorkspaceEventData} in handlers that must never throw.
 *
 * Pass a payload type to name the wire contract at the call site
 * (`parseWorkspaceEventData<{ status: string }>(raw)`) instead of double-casting
 * the loosely-typed `record.payload` afterwards.
 */
export function parseWorkspaceEventData<TPayload = Record<string, unknown>>(
  raw: string,
): WorkspaceEventData<TPayload> {
  const rec = WorkspaceEventRecord.parse(JSON.parse(raw));
  const payload: unknown = rec.payload;
  return { ...rec, payload: payload as TPayload };
}

/** Non-throwing variant: returns `null` for anything that is not a valid envelope. */
export function safeParseWorkspaceEventData<TPayload = Record<string, unknown>>(
  raw: string,
): WorkspaceEventData<TPayload> | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = WorkspaceEventRecord.safeParse(decoded);
  if (!result.success) return null;
  const payload: unknown = result.data.payload;
  return { ...result.data, payload: payload as TPayload };
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

/**
 * SSE event name for a stream terminated because the subscriber's workspace
 * access was revoked mid-stream.
 *
 * Lives here so the producing loader and the consuming hooks share one literal,
 * and so client code can reference it without importing a `.server` module.
 * Clients must `close()` on this: EventSource auto-reconnects after a
 * server-side close, and each retry would be rejected by the data-plane
 * middleware, leaving the tab in a retry loop.
 */
export const ACCESS_REVOKED_EVENT = "access_revoked";
