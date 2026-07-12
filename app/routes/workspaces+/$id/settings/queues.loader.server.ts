import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { getUserRole } from "@/lib/database/workspace.server";
import { loadInboundQueueSettings } from "@/lib/inbound-queue-db.server";
import { MemberRole } from "@/lib/member-role";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params, context }: LoaderFunctionArgs) => {
  const { headers, user, workspaceId, userRole } = getWorkspaceRouteContext(context);
  if (!user || !workspaceId) {
    return redirect("/signin");
  }
  if (!userRole || userRole === MemberRole.Caller) {
    return redirect("..");
  }

  const { queues, members, numbers } = await loadInboundQueueSettings(workspaceId);

  return routeData(
    {
      queues,
      members,
      numbers,
      workspaceId,
    },
    { headers },
  );
};
