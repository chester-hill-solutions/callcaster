import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { listWorkspaceSurveysApi } from "@/lib/platform-data.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { user, workspaceId, userRole } = auth;

    if (!workspaceId) {
      throw new Response("Workspace ID is required", { status: 400 });
    }
    const result = await listWorkspaceSurveysApi(workspaceId);
    if (!result.ok) {
      throw new Response(result.error, { status: result.status });
    }

    return routeData({
      surveys: result.surveys,
      workspaceId,
      user,
      userRole,
    });
  },
});
