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
      // Callers can't reach any /settings/* route. Explicit absolute
      // URL — `..` resolved against
      // `/workspaces/$id/settings/numbers/purchase` per RFC 3986 lands
      // on `/workspaces/$id/settings/numbers/`, which a Caller also
      // can't access; bounce to workspace root instead.
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
