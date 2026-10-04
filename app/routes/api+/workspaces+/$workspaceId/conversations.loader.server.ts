import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceConversationsApi,
  getWorkspaceUnreadConversationCountApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("campaigns.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    if (url.searchParams.get("summary") === "unread") {
      const result = await getWorkspaceUnreadConversationCountApi(auth.workspaceId);
      return result.ok
        ? jsonResponse({ unread_count: result.unreadCount }, 200)
        : jsonError(result.error, result.status);
    }

    const result = await listWorkspaceConversationsApi(
      auth.workspaceId,
      url.searchParams,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(
      {
        conversations: result.conversations,
        pagination: result.pagination,
      },
      200,
    );
  },
});
