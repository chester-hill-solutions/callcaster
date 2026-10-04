import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceConversationsApi,
  getWorkspaceUnreadConversationCountApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";
import { zConversationSummaryMode } from "@/lib/api-generated/zod.gen";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("campaigns.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const summary = url.searchParams.get("summary");
    if (summary !== null) {
      if (!zConversationSummaryMode.safeParse(summary).success) {
        return jsonError("Unknown summary mode", 400);
      }
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
