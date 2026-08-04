import { data as routeData, redirect } from "react-router";
import { getAdminWorkspaceDetail } from "@/lib/platform-admin.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params }) => {
    const workspaceId = params.workspaceId;

    if (!workspaceId) {
      throw redirect("/admin?tab=workspaces");
    }

    const result = await getAdminWorkspaceDetail(workspaceId);
    if (!result.ok) {
      throw redirect("/admin?tab=workspaces");
    }

    return routeData({
      workspace: result.workspace,
    });
  },
});
