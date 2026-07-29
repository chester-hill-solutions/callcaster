import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceConversationsApi,
} from "@/lib/platform-data.server";
import { requireDataPlaneRouteCapability } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

async function requireWorkspaceDataPlane({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  return requireDataPlaneRouteCapability(context, workspaceId, "campaigns.read");
}

export const loader = defineLoader({
  auth: requireWorkspaceDataPlane,
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
