import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["none"],
  handler: ({ auth }) => {
    const { user, workspaceId, userRole, headers } = auth;

    if (!workspaceId) {
      throw new Response("Workspace ID is required", { status: 400 });
    }

    if (!userRole || !["owner", "admin", "member"].includes(userRole)) {
      throw new Response("Unauthorized", { status: 403 });
    }

    return routeData({
      workspaceId,
      user,
      userRole,
    }, { headers });
  },
});
