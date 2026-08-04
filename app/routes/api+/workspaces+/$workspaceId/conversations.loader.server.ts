import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceConversationsApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuth } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: dataPlaneCapabilityAuth("campaigns.read"),
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
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
