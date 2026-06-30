import { data as routeData, redirect } from "react-router";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
} from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/auth.server";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const tdb = createTenantDb(workspaceId);
  const [{ data: users }, { data: phoneNumbers }, creditsBalance, mediaNames, queues, scripts] =
    await Promise.all([
      getWorkspaceUsers({ workspaceId }),
      getWorkspacePhoneNumbers({ workspaceId }),
      getWorkspaceCredits(workspaceId),
      null.storage.from("workspaceAudio").list(workspaceId),
      tdb.inbound_queue.findMany({
        columns: { id: true, name: true },
        orderBy: (queue, { asc: ascFn }) => [ascFn(queue.name)],
      }),
      tdb.script.findMany({
        columns: { id: true, name: true },
        orderBy: (script, { asc: ascFn }) => [ascFn(script.name)],
      }),
    ]);

  const userRole = await getUserRole({
    user,
    workspaceId,
  });
  const hasAccess = userRole?.role !== MemberRole.Caller;
  if (!hasAccess) return redirect("..");

  return routeData(
    {
      phoneNumbers,
      workspaceId,
      mediaNames: mediaNames.data,
      users,
      queues,
      scripts,
      creditsBalance: creditsBalance ?? 0,
    },
    { headers },
  );
};
