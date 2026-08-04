import {
  decodeAuditEventCursor,
  listWorkspaceAuditEvents,
  parseAuditEventPageSize,
} from "@/lib/audit-event.server";

/**
 * List workspace audit events. Capability `audit.read` is enforced by the
 * route loader; this helper only validates cursor/limit and reads rows.
 */
export async function listWorkspaceAuditEventsApi(
  _userId: string | null,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeAuditEventCursor(cursorRaw);
  if (cursorRaw && !cursor) {
    return { ok: false as const, error: "Invalid cursor", status: 400 };
  }

  const limit = parseAuditEventPageSize(searchParams.get("limit"));
  const { events, nextCursor } = await listWorkspaceAuditEvents({
    workspaceId,
    limit,
    cursor,
  });

  return {
    ok: true as const,
    events: events.map((event) => ({
      id: event.id,
      workspace_id: event.workspace_id,
      created_at: event.created_at,
      actor_type: event.actor_type,
      actor_id: event.actor_id,
      api_key_id: event.api_key_id,
      action: event.action,
      target_type: event.target_type,
      target_id: event.target_id,
      outcome: event.outcome,
      request_id: event.request_id,
      metadata: event.metadata,
    })),
    next_cursor: nextCursor,
  };
}
