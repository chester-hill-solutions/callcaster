import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import {
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { MemberRole } from "@/lib/member-role";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";
import { listObjects } from "@/lib/object-storage.server";
import { defineLoader } from "@/lib/handler.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read", "external"],
  handler: async ({ auth }) => {
    const { headers, user, workspaceId, userRole } = auth;
    if (!user || !workspaceId) {
      return redirect("/signin");
    }

    try {
      await requireWorkspaceAccess({ user, workspaceId });
    } catch {
      return routeData(
        { error: "Workspace not found" },
        { headers, status: 404 },
      );
    }

    const tdb = createTenantDb(workspaceId);
    const [
      { data: users },
      { data: phoneNumbers },
      creditsBalance,
      mediaNames,
      queues,
      scripts,
      onboarding,
    ] = await Promise.all([
      getWorkspaceUsers({ workspaceId }),
      getWorkspacePhoneNumbers({ workspaceId }),
      getWorkspaceCredits(workspaceId),
      listObjects("workspaceAudio", workspaceId),
      tdb.inbound_queue.findMany({
        columns: { id: true, name: true },
        orderBy: (queue, { asc: ascFn }) => [ascFn(queue.name)],
      }),
      tdb.script.findMany({
        columns: { id: true, name: true },
        orderBy: (script, { asc: ascFn }) => [ascFn(script.name)],
      }),
      getWorkspaceMessagingOnboardingState({ workspaceId }),
    ]);
    const hasAccess = userRole !== MemberRole.Caller;
    if (!hasAccess) {
      return redirect(`/workspaces/${workspaceId}/settings`, { headers });
    }

    return routeData(
      {
        phoneNumbers,
        workspaceId,
        mediaNames,
        users,
        queues,
        scripts,
        creditsBalance: creditsBalance ?? 0,
        onboarding,
        userRole,
      },
      { headers },
    );
  },
});
