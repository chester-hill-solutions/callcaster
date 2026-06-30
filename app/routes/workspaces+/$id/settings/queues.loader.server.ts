import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserRole } from "@/lib/database.server";
import { loadInboundQueueSettings } from "@/lib/inbound-queue-db.server";
import { MemberRole } from "@/lib/member-role";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({ user, workspaceId });
  if (!userRole || userRole.role === MemberRole.Caller) {
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
