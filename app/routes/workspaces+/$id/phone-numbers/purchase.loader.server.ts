import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { MemberRole } from "@/lib/member-role";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (!user || !workspaceId) {
      return redirect("/signin");
    }
    if (userRole === MemberRole.Caller) {
      // An explicit workspace-root URL avoids a relative redirect back to a
      // route the caller cannot access.
      return redirect(`/workspaces/${workspaceId}`);
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
  },
});
