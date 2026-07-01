import {
  formatCallLogAgentName,
  isInboundDirection,
  parseCallLogSearchParams,
  resolveCallLogParties,
  type CallLogSearchState,
  type CallLogSortKey,
} from "../../shared/call-log";
import { and, asc, count, desc, eq, gt, ilike, not, or, type SQL } from "drizzle-orm";
import {
  call as callTable,
  outreach_attempt as outreachAttemptTable,
  user as userTable,
} from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb } from "@/server/tenant-db";
import { listWorkspaceMembersEnriched } from "@/lib/workspace-members-db.server";

type CallLogQueryRow = {
  sid: string;
  from: string | null;
  to: string | null;
  direction: string | null;
  date_created: string;
  recording_url: string | null;
  status: string | null;
  disposition: string | null;
  user_id: string | null;
  username: string | null;
  first_name: string | null;
};

export type CallLogRow = {
  sid: string;
  dateCreated: string;
  callcasterNumber: string | null;
  otherNumber: string | null;
  direction: "inbound" | "outbound";
  disposition: string | null;
  agentName: string | null;
  agentUserId: string | null;
  recordingUrl: string | null;
  status: string | null;
};

export type CallLogLoaderResult = {
  rows: CallLogRow[];
  filters: CallLogSearchState;
  workspaceNumbers: Array<{ id: number; phone_number: string | null }>;
  agents: Array<{ id: string; label: string }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
};

function escapeLikePattern(value: string): string {
  return `%${value.replace(/[%_\\]/g, "\\$&")}%`;
}

function applyPhoneFilter(columnFrom: typeof callTable.from, columnTo: typeof callTable.to, value: string): SQL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const pattern = escapeLikePattern(trimmed);
  return or(ilike(columnFrom, pattern), ilike(columnTo, pattern)) ?? null;
}

function buildCallLogWhere(workspaceId: string, filters: CallLogSearchState): SQL {
  const conditions: SQL[] = [eq(callTable.workspace, workspaceId)];

  if (filters.direction === "inbound") {
    conditions.push(ilike(callTable.direction, "%inbound%"));
  } else if (filters.direction === "outbound") {
    conditions.push(not(ilike(callTable.direction, "%inbound%")));
  }

  const callcasterFilter = applyPhoneFilter(callTable.from, callTable.to, filters.callcasterNumber);
  if (callcasterFilter) {
    conditions.push(callcasterFilter);
  }

  const otherNumberFilter = applyPhoneFilter(callTable.from, callTable.to, filters.otherNumber);
  if (otherNumberFilter) {
    conditions.push(otherNumberFilter);
  }

  const disposition = filters.disposition.trim();
  if (disposition) {
    conditions.push(eq(outreachAttemptTable.disposition, disposition));
  }

  const agentUserId = filters.agentUserId.trim();
  if (agentUserId) {
    conditions.push(eq(outreachAttemptTable.user_id, agentUserId));
  }

  return and(...conditions)!;
}

function buildCallLogOrderBy(sortKey: CallLogSortKey, sortDirection: "asc" | "desc") {
  const dir = sortDirection === "asc" ? asc : desc;
  switch (sortKey) {
    case "date_created":
      return [dir(callTable.date_created)];
    case "callcaster_number":
      return [dir(callTable.from), dir(callTable.to)];
    case "other_number":
      return [dir(callTable.to), dir(callTable.from)];
    case "direction":
      return [dir(callTable.direction)];
    case "disposition":
      return [dir(outreachAttemptTable.disposition)];
    case "agent":
      return [dir(userTable.username)];
    default: {
      const neverSortKey: never = sortKey;
      return neverSortKey ? [desc(callTable.date_created)] : [desc(callTable.date_created)];
    }
  }
}

function mapCallLogRow(
  row: CallLogQueryRow,
  workspaceNumbers: readonly string[],
): CallLogRow {
  const parties = resolveCallLogParties({
    from: row.from,
    to: row.to,
    direction: row.direction,
    workspaceNumbers,
  });

  const user =
    row.user_id && row.username
      ? { id: row.user_id, username: row.username, first_name: row.first_name }
      : null;

  return {
    sid: row.sid,
    dateCreated: row.date_created,
    callcasterNumber: parties.callcasterNumber,
    otherNumber: parties.otherNumber,
    direction: parties.flow,
    disposition: row.disposition ?? null,
    agentName: formatCallLogAgentName(user),
    agentUserId: row.user_id ?? null,
    recordingUrl: row.recording_url,
    status: row.status,
  };
}

const outreachAttemptJoin = and(
  eq(callTable.outreach_attempt_id, outreachAttemptTable.id),
  eq(outreachAttemptTable.workspace, callTable.workspace),
)!;

export async function loadCallLogPage(args: {
  workspaceId: string;
  requestUrl: string;
}): Promise<CallLogLoaderResult> {
  const url = new URL(args.requestUrl);
  const filters = parseCallLogSearchParams(url.searchParams);
  const tdb = createTenantDb(args.workspaceId);

  const workspaceNumbers = await tdb.workspace_number.findMany({
    columns: { id: true, phone_number: true },
    orderBy: (number, { asc: ascFn }) => [ascFn(number.phone_number)],
  });

  const workspacePhoneList = workspaceNumbers
    .map((entry) => entry.phone_number)
    .filter((phone): phone is string => Boolean(phone));

  const memberRows = await listWorkspaceMembersEnriched(args.workspaceId);
  const agents = memberRows
    .map((entry) => ({
      id: entry.user_id,
      label:
        formatCallLogAgentName({
          username: entry.username,
          first_name: entry.first_name,
        }) ?? entry.username,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const whereClause = buildCallLogWhere(args.workspaceId, filters);
  const orderBy = buildCallLogOrderBy(filters.sortKey, filters.sortDirection);
  const offset = (filters.page - 1) * filters.pageSize;

  const [countRow, data] = await Promise.all([
    db
      .select({ value: count() })
      .from(callTable)
      .leftJoin(outreachAttemptTable, outreachAttemptJoin)
      .leftJoin(userTable, eq(outreachAttemptTable.user_id, userTable.id))
      .where(whereClause),
    db
      .select({
        sid: callTable.sid,
        from: callTable.from,
        to: callTable.to,
        direction: callTable.direction,
        date_created: callTable.date_created,
        recording_url: callTable.recording_url,
        status: callTable.status,
        disposition: outreachAttemptTable.disposition,
        user_id: outreachAttemptTable.user_id,
        username: userTable.username,
        first_name: userTable.first_name,
      })
      .from(callTable)
      .leftJoin(outreachAttemptTable, outreachAttemptJoin)
      .leftJoin(userTable, eq(outreachAttemptTable.user_id, userTable.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(filters.pageSize)
      .offset(offset),
  ]);

  const rows = data.map((row) => mapCallLogRow(row, workspacePhoneList));
  const totalCount = countRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize));

  return {
    rows,
    filters,
    workspaceNumbers,
    agents,
    pagination: {
      currentPage: filters.page,
      totalPages,
      totalCount,
      pageSize: filters.pageSize,
    },
  };
}

export function summarizeCallLogDirection(direction: string | null): "inbound" | "outbound" {
  return isInboundDirection(direction) ? "inbound" : "outbound";
}
