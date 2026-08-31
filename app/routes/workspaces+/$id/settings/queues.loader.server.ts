import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { loadInboundQueueSettings } from "@/lib/inbound-queue-db.server";
import { MemberRole } from "@/lib/member-role";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (!user || !workspaceId) {
      return redirect("/signin");
    }
    if (!userRole || userRole === MemberRole.Caller) {
      // Callers can't reach any /settings/* route; bounce them to the
      // workspace root. Explicit absolute URL — `..` resolved against
      // `/workspaces/$id/settings/queues` per RFC 3986 also lands on
      // `/workspaces/$id/`, but a rename or refactor could silently
      // shift where it points.
      return redirect(`/workspaces/${workspaceId}`);
    }

    const { queues, members, numbers, agents } = await loadInboundQueueSettings(workspaceId);

    return routeData(
      {
        queues,
        members,
        numbers,
        agents,
        workspaceId,
      },
      { headers },
    );
  },
});
