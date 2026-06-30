import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/auth.server";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({
    user,
    workspaceId,
  });
  if (userRole?.role === MemberRole.Caller) {
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
