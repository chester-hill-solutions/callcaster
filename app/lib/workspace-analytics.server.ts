import {
  buildWorkspaceAnalytics,
  defaultAnalyticsRange,
  parseAnalyticsDateParam,
  type WorkspaceAnalyticsResult,
} from "../../shared/workspace-analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type AnalyticsAttemptRow = {
  id: number;
  user_id: string | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  disposition: string | null;
  call: Array<{
    duration: string | null;
    call_duration: number | null;
    status: string | null;
    end_time: string | null;
  }> | null;
};

export async function loadWorkspaceAnalytics(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  requestUrl: string;
  currentUserId: string;
  canViewAllUsers: boolean;
}): Promise<WorkspaceAnalyticsResult> {
  const url = new URL(args.requestUrl);
  const defaultRange = defaultAnalyticsRange();
  const range = {
    from: parseAnalyticsDateParam(url.searchParams.get("from"), new Date(defaultRange.from)),
    to: parseAnalyticsDateParam(url.searchParams.get("to"), new Date(defaultRange.to)),
  };

  const requestedUserId = url.searchParams.get("userId")?.trim() ?? "";
  const scopedUserId = args.canViewAllUsers
    ? requestedUserId || null
    : args.currentUserId;

  let attemptsQuery = args.supabaseClient
    .from("outreach_attempt")
    .select(
      `
      id,
      user_id,
      created_at,
      answered_at,
      ended_at,
      disposition,
      call (
        duration,
        call_duration,
        status,
        end_time
      )
    `,
    )
    .eq("workspace", args.workspaceId)
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (scopedUserId) {
    attemptsQuery = attemptsQuery.eq("user_id", scopedUserId);
  }

  const { data: workspaceUsers } = await args.supabaseClient
    .from("workspace_users")
    .select("user_id, user:user_id(id, username, first_name)")
    .eq("workspace_id", args.workspaceId);

  const { data: attempts, error } = await attemptsQuery;
  if (error) {
    throw new Error(error.message);
  }

  const users = (workspaceUsers ?? [])
    .map((entry) => {
      const user = entry.user as {
        id: string;
        username: string;
        first_name: string | null;
      } | null;
      if (!user) return null;
      const label = user.first_name
        ? `${user.first_name} (${user.username})`
        : user.username;
      return { id: user.id, label };
    })
    .filter((entry): entry is { id: string; label: string } => Boolean(entry))
    .sort((left, right) => left.label.localeCompare(right.label));

  return buildWorkspaceAnalytics({
    attempts: (attempts as AnalyticsAttemptRow[] | null) ?? [],
    users,
    range,
    scopedUserId,
  });
}
