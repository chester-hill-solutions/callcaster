import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { loadWorkspaceAnalytics } from "@/lib/workspace-analytics.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { defaultAnalyticsRange } from "../../../../shared/workspace-analytics";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { User } from "@/lib/types";
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;

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

  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });

  if (!userRole?.role) {
    return routeData(
      {
        workspace: null,
        userRole: null,
        campaigns: [],
        analytics: emptyAnalytics(),
        workspaceUsers: [],
        currentUserId: user.id,
        error: "You don't have access to this workspace",
      } satisfies WorkspaceAnalyticsLoaderData,
      { headers, status: 403 },
    );
  }

  const [{ data: workspace, error: workspaceError }, { data: campaigns, error: campaignsError }] =
    await Promise.all([
      supabaseClient
        .from("workspace")
        .select("id, name, credits")
        .eq("id", workspaceId)
        .single(),
      supabaseClient
        .from("campaign")
        .select("id, title, status")
        .eq("workspace", workspaceId)
        .order("created_at", { ascending: false }),
    ]);

  if (campaignsError) {
    logger.error("Failed to load campaigns for analytics nav:", campaignsError);
  }

  if (workspaceError || !workspace) {
    return routeData(
      {
        workspace: null,
        userRole: userRole.role,
        campaigns: campaigns ?? [],
        analytics: emptyAnalytics(),
        workspaceUsers: [],
        currentUserId: user.id,
        error: "Workspace not found",
      } satisfies WorkspaceAnalyticsLoaderData,
      { headers, status: 404 },
    );
  }

  const canViewAllUsers =
    userRole.role === MemberRole.Admin ||
    userRole.role === MemberRole.Owner ||
    userRole.role === MemberRole.Member;

  try {
    const [{ data: workspaceUsersRows }, analytics] = await Promise.all([
      supabaseClient
        .from("workspace_users")
        .select("user_id, user:user_id(id, username, first_name)")
        .eq("workspace_id", workspaceId),
      loadWorkspaceAnalytics({
        supabaseClient,
        workspaceId,
        requestUrl: request.url,
        currentUserId: user.id,
        canViewAllUsers,
      }),
    ]);

    const workspaceUsers = (workspaceUsersRows ?? [])
      .map((entry) => {
        const workspaceUser = entry.user as {
          id: string;
          username: string;
          first_name: string | null;
        } | null;
        if (!workspaceUser) return null;
        return {
          id: workspaceUser.id,
          label: workspaceUser.first_name
            ? `${workspaceUser.first_name} (${workspaceUser.username})`
            : workspaceUser.username,
        };
      })
      .filter((entry): entry is { id: string; label: string } => Boolean(entry))
      .sort((left, right) => left.label.localeCompare(right.label));

    return routeData(
      {
        workspace,
        userRole: userRole.role,
        campaigns: campaigns ?? [],
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
        workspace,
        userRole: userRole.role,
        campaigns: campaigns ?? [],
        analytics: emptyAnalytics(),
        workspaceUsers: [],
        currentUserId: user.id,
        error: "Failed to load analytics. Please try again.",
      } satisfies WorkspaceAnalyticsLoaderData,
      { headers, status: 500 },
    );
  }
};
