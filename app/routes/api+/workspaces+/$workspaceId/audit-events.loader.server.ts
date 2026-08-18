import { listWorkspaceAuditEventsApi } from "@/lib/platform-audit.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("audit.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const result = await listWorkspaceAuditEventsApi(
      auth.auth.userId,
      auth.workspaceId,
      url.searchParams,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        events: result.events,
        next_cursor: result.next_cursor,
      },
      200,
    );
  },
});
