import { data as routeData, redirect } from "react-router";
import { getAdminWorkspaceDetail } from "@/lib/platform-admin.server";
import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireSudoAdmin(request);
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
};
