import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  buildWorkspaceAnalytics,
  defaultAnalyticsRange,
  parseAnalyticsDateParam,
  type WorkspaceAnalyticsResult,
} from "../../shared/workspace-analytics";
import { call as callTable, outreach_attempt as outreachAttemptTable } from "@/db/schema";
import { listWorkspaceMembersEnriched } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";

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

  const tdb = createTenantDb(args.workspaceId);
  const attemptWhere = and(
    gte(outreachAttemptTable.created_at, range.from),
    lte(outreachAttemptTable.created_at, range.to),
    scopedUserId ? eq(outreachAttemptTable.user_id, scopedUserId) : undefined,
  );

  const attempts = await tdb.outreach_attempt.findMany({
    where: attemptWhere,
    orderBy: [desc(outreachAttemptTable.created_at)],
    limit: 5000,
  });

  const attemptIds = attempts.map((row) => row.id);
  const calls =
    attemptIds.length === 0
      ? []
      : await tdb.call.findMany({
          where: inArray(callTable.outreach_attempt_id, attemptIds),
          columns: {
            outreach_attempt_id: true,
            duration: true,
            call_duration: true,
            status: true,
            end_time: true,
          },
        });

  const callsByAttemptId = new Map<number, AnalyticsAttemptRow["call"]>();
  for (const callRow of calls) {
    if (callRow.outreach_attempt_id == null) {
      continue;
    }
    const bucket = callsByAttemptId.get(callRow.outreach_attempt_id) ?? [];
    bucket.push({
      duration: callRow.duration,
      call_duration: callRow.call_duration,
      status: callRow.status,
      end_time: callRow.end_time,
    });
    callsByAttemptId.set(callRow.outreach_attempt_id, bucket);
  }

  const analyticsAttempts: AnalyticsAttemptRow[] = attempts.map((attempt) => ({
    id: attempt.id,
    user_id: attempt.user_id,
    created_at: attempt.created_at,
    answered_at: attempt.answered_at,
    ended_at: attempt.ended_at,
    disposition: attempt.disposition,
    call: callsByAttemptId.get(attempt.id) ?? null,
  }));

  const memberRows = await listWorkspaceMembersEnriched(args.workspaceId);
  const users = memberRows
    .map((user) => {
      const label = user.first_name
        ? `${user.first_name} (${user.username})`
        : user.username;
      return { id: user.user_id, label };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return buildWorkspaceAnalytics({
    attempts: analyticsAttempts,
    users,
    range,
    scopedUserId,
  });
}
