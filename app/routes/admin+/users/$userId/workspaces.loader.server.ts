import { data as routeData, redirect } from "react-router";
import { getAdminUserWorkspaces } from "@/lib/platform-admin.server";
import { getAdminRouteContext } from "@/lib/admin-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
  const { userData } = getAdminRouteContext(context);
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
};
