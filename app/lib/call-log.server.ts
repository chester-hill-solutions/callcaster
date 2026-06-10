import {
  formatCallLogAgentName,
  isInboundDirection,
  parseCallLogSearchParams,
  resolveCallLogParties,
  type CallLogSearchState,
  type CallLogSortKey,
} from "../../shared/call-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type CallLogQueryRow = Database["public"]["Tables"]["call"]["Row"] & {
  outreach_attempt: {
    disposition: string | null;
    user_id: string | null;
    user: {
      id: string;
      username: string;
      first_name: string | null;
    } | null;
  } | null;
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

const CALL_SELECT = `
  sid,
  from,
  to,
  direction,
  date_created,
  recording_url,
  status,
  outreach_attempt (
    disposition,
    user_id,
    user:user_id (
      id,
      username,
      first_name
    )
  )
`;

function applyDirectionFilter<T extends { ilike: (col: string, pattern: string) => T; not: (col: string, op: string, value: string) => T }>(
  query: T,
  direction: CallLogSearchState["direction"],
): T {
  if (direction === "inbound") {
    return query.ilike("direction", "%inbound%");
  }
  if (direction === "outbound") {
    return query.not("direction", "ilike", "%inbound%");
  }
  return query;
}

function applyPhoneFilter<T extends { or: (filters: string) => T }>(
  query: T,
  value: string,
): T {
  const trimmed = value.trim();
  if (!trimmed) return query;
  const escaped = trimmed.replace(/[%_]/g, "\\$&");
  return query.or(`from.ilike.%${escaped}%,to.ilike.%${escaped}%`);
}

function applyDispositionFilter<T extends { eq: (col: string, value: string) => T }>(
  query: T,
  disposition: string,
): T {
  const trimmed = disposition.trim();
  if (!trimmed) return query;
  return query.eq("outreach_attempt.disposition", trimmed);
}

function applyAgentFilter<T extends { eq: (col: string, value: string) => T }>(
  query: T,
  agentUserId: string,
): T {
  const trimmed = agentUserId.trim();
  if (!trimmed) return query;
  return query.eq("outreach_attempt.user_id", trimmed);
}

function orderCallLogQuery<T extends {
  order: (
    column: string,
    options?: { ascending?: boolean; referencedTable?: string },
  ) => T;
}>(query: T, sortKey: CallLogSortKey, sortDirection: "asc" | "desc"): T {
  const ascending = sortDirection === "asc";
  switch (sortKey) {
    case "date_created":
      return query.order("date_created", { ascending });
    case "callcaster_number":
      return query.order("from", { ascending }).order("to", { ascending });
    case "other_number":
      return query.order("to", { ascending }).order("from", { ascending });
    case "direction":
      return query.order("direction", { ascending });
    case "disposition":
      return query.order("disposition", {
        ascending,
        referencedTable: "outreach_attempt",
      });
    case "agent":
      return query.order("username", {
        ascending,
        referencedTable: "outreach_attempt.user",
      });
    default: {
      const neverSortKey: never = sortKey;
      return neverSortKey ? query : query.order("date_created", { ascending: false });
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

  return {
    sid: row.sid,
    dateCreated: row.date_created,
    callcasterNumber: parties.callcasterNumber,
    otherNumber: parties.otherNumber,
    direction: parties.flow,
    disposition: row.outreach_attempt?.disposition ?? null,
    agentName: formatCallLogAgentName(row.outreach_attempt?.user ?? null),
    agentUserId: row.outreach_attempt?.user_id ?? null,
    recordingUrl: row.recording_url,
    status: row.status,
  };
}

export async function loadCallLogPage(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  requestUrl: string;
}): Promise<CallLogLoaderResult> {
  const url = new URL(args.requestUrl);
  const filters = parseCallLogSearchParams(url.searchParams);

  const { data: workspaceNumbersData } = await args.supabaseClient
    .from("workspace_number")
    .select("id, phone_number")
    .eq("workspace", args.workspaceId)
    .order("phone_number", { ascending: true });

  const workspaceNumbers = workspaceNumbersData ?? [];
  const workspacePhoneList = workspaceNumbers
    .map((entry) => entry.phone_number)
    .filter((phone): phone is string => Boolean(phone));

  const { data: workspaceUsers } = await args.supabaseClient
    .from("workspace_users")
    .select("user_id, user:user_id(id, username, first_name)")
    .eq("workspace_id", args.workspaceId);

  const agents = (workspaceUsers ?? [])
    .map((entry) => {
      const user = entry.user as { id: string; username: string; first_name: string | null } | null;
      if (!user) return null;
      return {
        id: user.id,
        label: formatCallLogAgentName(user) ?? user.username,
      };
    })
    .filter((entry): entry is { id: string; label: string } => Boolean(entry))
    .sort((left, right) => left.label.localeCompare(right.label));

  let countQuery = args.supabaseClient
    .from("call")
    .select("sid, outreach_attempt!left(disposition, user_id)", {
      count: "exact",
      head: true,
    })
    .eq("workspace", args.workspaceId);

  let dataQuery = args.supabaseClient
    .from("call")
    .select(CALL_SELECT, { count: "exact" })
    .eq("workspace", args.workspaceId);

  countQuery = applyDirectionFilter(countQuery, filters.direction);
  dataQuery = applyDirectionFilter(dataQuery, filters.direction);
  countQuery = applyPhoneFilter(countQuery, filters.callcasterNumber);
  dataQuery = applyPhoneFilter(dataQuery, filters.callcasterNumber);
  countQuery = applyPhoneFilter(countQuery, filters.otherNumber);
  dataQuery = applyPhoneFilter(dataQuery, filters.otherNumber);
  countQuery = applyDispositionFilter(countQuery, filters.disposition);
  dataQuery = applyDispositionFilter(dataQuery, filters.disposition);
  countQuery = applyAgentFilter(countQuery, filters.agentUserId);
  dataQuery = applyAgentFilter(dataQuery, filters.agentUserId);

  dataQuery = orderCallLogQuery(dataQuery, filters.sortKey, filters.sortDirection);

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  dataQuery = dataQuery.range(from, to);

  const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery]);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data as CallLogQueryRow[] | null ?? []).map((row) =>
    mapCallLogRow(row, workspacePhoneList),
  );

  const totalCount = count ?? 0;
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
