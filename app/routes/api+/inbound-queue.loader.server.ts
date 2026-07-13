import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { loadInboundQueueSettings } from "@/lib/inbound-queue-db.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ params, url, auth }) => {
    const workspaceId = url.searchParams.get("workspace_id") || params.id;
    if (!workspaceId) {
      return jsonError("workspace_id required", 400);
    }

    const userRole = await getUserRole({
      user: { id: auth.user.id },
      workspaceId,
    });
    if (!userRole) {
      return jsonError("Not a member", 403);
    }

    const { queues, members, numbers } = await loadInboundQueueSettings(workspaceId);

    return jsonResponse({ queues, members, numbers }, 200);
  },
});
