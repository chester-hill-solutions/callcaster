import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  listWorkspaceCampaignsApi,
} from "@/lib/platform-data.server";
import { requireDataPlaneRouteCapability } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ params, context }: LoaderFunctionArgs) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    return requireDataPlaneRouteCapability(context, workspaceId, "campaigns.read");
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await listWorkspaceCampaignsApi(auth.workspaceId);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ campaigns: result.campaigns }, 200);
  },
});
