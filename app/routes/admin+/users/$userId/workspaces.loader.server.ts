import { data as routeData, redirect } from "react-router";
import { getAdminUserWorkspaces } from "@/lib/platform-admin.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth, params }) => {
    const { userData } = auth;
    const userId = params.userId;

    if (!userId) {
      throw redirect("/admin?tab=users");
    }

    const result = await getAdminUserWorkspaces(userId);
    if (!result.ok) {
      throw redirect("/admin?tab=users");
    }

    return routeData({
      currentUser: userData,
      targetUser: result.targetUser,
      allWorkspaces: result.allWorkspaces,
      userWorkspaces: result.userWorkspaces,
      pendingInvites: result.pendingInvites,
    });
  },
});
