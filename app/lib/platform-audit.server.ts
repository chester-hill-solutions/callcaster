import {
  decodeAuditEventCursor,
  listWorkspaceAuditEvents,
  parseAuditEventPageSize,
} from "@/lib/audit-event.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { MemberRole } from "@/lib/member-role";

export async function listWorkspaceAuditEventsApi(
  userId: string | null,
  workspaceId: string,
  searchParams: URLSearchParams,
) {
  if (!userId) {
    return {
      ok: false as const,
      error: "Audit log access requires a signed-in owner session",
      status: 403,
    };
  }

  const role = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!role || role.role !== MemberRole.Owner) {
    return {
      ok: false as const,
      error: "Only workspace owners can view the audit log",
      status: 403,
    };
  }

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
