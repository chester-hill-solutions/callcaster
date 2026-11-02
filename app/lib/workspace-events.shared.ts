/** Client-safe workspace event types for SSE consumers. */
import { z } from "zod";

export type PredictiveBroadcastPayload = {
  contact_id: number | null;
  status: string;
  conference_id?: string;
  conference_ended?: boolean;
  call_sid?: string;
  user_id?: string;
  campaign_id?: number;
  outreach_attempt_id?: number;
  conference_sid?: string;
  conference_sequence?: number;
  customer_event?: "joined" | "left";
  human_revision?: string;
};

export const PredictiveCustomerBroadcast = z.object({
  contact_id: z.number().int().positive(), status: z.string().min(1),
  call_sid: z.string().regex(/^CA[0-9a-f]{32}$/i), user_id: z.string().min(1),
  campaign_id: z.number().int().positive(), outreach_attempt_id: z.number().int().positive(),
  conference_id: z.string().min(1), conference_sid: z.string().regex(/^CF[0-9a-f]{32}$/i).optional(),
  conference_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  customer_event: z.enum(["joined", "left"]).optional(),
  human_revision: z.string().regex(/^[1-9]\d*$/).max(19).optional(),
}).superRefine((value, context) => {
  if (value.customer_event && (!value.conference_sid || value.conference_sequence === undefined)) {
    context.addIssue({ code: "custom", message: "Customer participation requires its conference and sequence" });
  }
});

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

export type RealtimeChangePayload<T extends Record<string, unknown> = Record<string, unknown>> =
  PostgresChangePayload & {
    new: T | null;
    old: T | null;
  };

/**
 * Parse an SSE `data:` frame. Throws on malformed JSON *or* a frame that is not
 * a workspace-event envelope; existing callers already wrap this in try/catch.
 * Prefer {@link safeParseWorkspaceEventData} in handlers that must never throw.
 */
export function parseWorkspaceEventData(raw: string): WorkspaceEventRecord {
  return WorkspaceEventRecord.parse(JSON.parse(raw));
}

/** Non-throwing variant: returns `null` for anything that is not a valid envelope. */
export function safeParseWorkspaceEventData(raw: string): WorkspaceEventRecord | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = WorkspaceEventRecord.safeParse(decoded);
  return result.success ? result.data : null;
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
