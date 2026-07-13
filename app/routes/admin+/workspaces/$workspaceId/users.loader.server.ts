import { data as routeData, redirect } from "react-router";
import { listAdminWorkspaceUsersWithUser } from "@/lib/workspace-members-db.server";
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

    const workspaceUsers = await listAdminWorkspaceUsersWithUser(workspaceId);

    return routeData({
      workspaceUsers,
    });
  },
});
