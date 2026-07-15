import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { MemberRole } from "@/lib/member-role";
import { loadWorkspaceAnalytics } from "@/lib/workspace-analytics.server";
import { logger } from "@/lib/logger.server";
import {
  getWorkspaceForClient,
  listWorkspaceMembersEnriched,
} from "@/lib/workspace-members-db.server";
import { defaultAnalyticsRange } from "../../../../shared/workspace-analytics";
import { campaign as campaignTable } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { desc } from "drizzle-orm";
import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";
import type { WorkspaceAnalyticsResult } from "../../../../shared/workspace-analytics";

export type WorkspaceAnalyticsLoaderData = {
  workspace: { id: string; name: string; credits: number } | null;
  userRole: string | null;
  campaigns: Array<{ id: number; title: string | null; status: string | null }>;
  analytics: WorkspaceAnalyticsResult;
  workspaceUsers: Array<{ id: string; label: string }>;
  currentUserId: string;
  error: string | null;
};

function emptyAnalytics(): WorkspaceAnalyticsResult {
  const range = defaultAnalyticsRange();
  return {
    range,
    summary: {
      totalDials: 0,
      totalConnected: 0,
      dialingSeconds: 0,
      connectedSeconds: 0,
      interfaceSeconds: 0,
      totalShifts: 0,
      totalShiftSeconds: 0,
    },
    users: [],
    shifts: [],
    scopedUserId: null,
  };
}

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth, url }) => {
    const { headers, user, workspaceId, userRole } = auth;

    if (!workspaceId || !user) {
      return routeData(
        {
          workspace: null,
          userRole: null,
          campaigns: [],
          analytics: emptyAnalytics(),
          workspaceUsers: [],
          currentUserId: "",
          error: "Workspace ID is required",
        } satisfies WorkspaceAnalyticsLoaderData,
        { headers, status: 400 },
      );
    }
    const tdb = createTenantDb(workspaceId);
    const [workspace, campaigns] = await Promise.all([
      getWorkspaceForClient(workspaceId),
      tdb.campaign.findMany({
        columns: { id: true, title: true, status: true },
        orderBy: [desc(campaignTable.created_at)],
      }),
    ]);

    if (!workspace) {
      return routeData(
        {
          workspace: null,
          userRole,
          campaigns,
          analytics: emptyAnalytics(),
          workspaceUsers: [],
          currentUserId: user.id,
          error: "Workspace not found",
        } satisfies WorkspaceAnalyticsLoaderData,
        { headers, status: 404 },
      );
    }

    const canViewAllUsers =
      userRole === MemberRole.Admin ||
      userRole === MemberRole.Owner ||
      userRole === MemberRole.Member;

    try {
      const [memberRows, analytics] = await Promise.all([
        listWorkspaceMembersEnriched(workspaceId),
        loadWorkspaceAnalytics({
          workspaceId,
          requestUrl: url.href,
          currentUserId: user.id,
          canViewAllUsers,
        }),
      ]);

      const workspaceUsers = memberRows
        .map((entry) => {
          const label = entry.first_name
            ? `${entry.first_name} (${entry.username})`
            : entry.username;
          return { id: entry.user_id, label };
        })
        .sort((left, right) => left.label.localeCompare(right.label));

      return routeData(
        {
          workspace: {
            id: workspace.id,
            name: workspace.name,
            credits: workspace.credits,
          },
          userRole,
          campaigns,
          analytics,
          workspaceUsers,
          currentUserId: user.id,
          error: null,
        } satisfies WorkspaceAnalyticsLoaderData,
        { headers },
      );
    } catch (error) {
      logger.error("Failed to load workspace analytics:", error);
      return routeData(
        {
          workspace: {
            id: workspace.id,
            name: workspace.name,
            credits: workspace.credits,
          },
          userRole,
          campaigns,
          analytics: emptyAnalytics(),
          workspaceUsers: [],
          currentUserId: user.id,
          error: "Failed to load analytics. Please try again.",
        } satisfies WorkspaceAnalyticsLoaderData,
        { headers, status: 500 },
      );
    }
  },
});
