import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { MemberRole } from "@/lib/member-role";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);
  if (!user || !workspaceId) {
    return redirect("/signin");
  }
  if (userRole === MemberRole.Caller) {
    return redirect("..");
  }

  const creditsBalance = await getWorkspaceCredits(workspaceId);
  if (creditsBalance == null) {
    throw new Response("Workspace not found", { status: 404, headers });
  }

  return routeData(
    {
      workspaceId,
      creditsBalance,
    },
    { headers },
  );
};
