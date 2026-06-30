import { data as routeData, redirect } from "react-router";
import { getAdminUserWorkspaces } from "@/lib/platform-admin.server";
import { requireSudoAdmin } from "../requireSudoAdmin.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, userData } = await requireSudoAdmin(request);
  const userId = params.userId;

  if (!userId) {
    throw redirect("/admin?tab=users");
  }

  const result = await getAdminUserWorkspaces(supabaseClient, userId);
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
