export const CALL_LOG_SORT_KEYS = [
  "date_created",
  "callcaster_number",
  "other_number",
  "direction",
  "disposition",
  "agent",
] as const;

export type CallLogSortKey = (typeof CALL_LOG_SORT_KEYS)[number];

export type CallLogDirectionFilter = "all" | "inbound" | "outbound";

export type CallLogFilters = {
  callcasterNumber: string;
  otherNumber: string;
  direction: CallLogDirectionFilter;
  disposition: string;
  agentUserId: string;
};

export type CallLogSorting = {
  sortKey: CallLogSortKey;
  sortDirection: "asc" | "desc";
};

export type CallLogPagination = {
  page: number;
  pageSize: number;
};

export type CallLogSearchState = CallLogFilters &
  CallLogSorting &
  CallLogPagination;

export const CALL_LOG_DEFAULT_PAGE_SIZE = 25;

const DEFAULT_SORT_KEY: CallLogSortKey = "date_created";
const DEFAULT_SORT_DIRECTION = "desc" as const;

export function isInboundDirection(direction: string | null | undefined): boolean {
  return (direction ?? "").toLowerCase().includes("inbound");
}

export function normalizeCallLogPhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^\d+]/g, "");
}

export function phonesLooselyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeCallLogPhone(left);
  const normalizedRight = normalizeCallLogPhone(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const leftDigits = normalizedLeft.replace(/\D/g, "");
  const rightDigits = normalizedRight.replace(/\D/g, "");
  if (!leftDigits || !rightDigits) return false;
  return (
    leftDigits.endsWith(rightDigits) ||
    rightDigits.endsWith(leftDigits) ||
    leftDigits === rightDigits
  );
}

export function resolveCallLogParties(args: {
  from: string | null;
  to: string | null;
  direction: string | null;
  workspaceNumbers: readonly string[];
}): {
  callcasterNumber: string | null;
  otherNumber: string | null;
  flow: "inbound" | "outbound";
} {
  const inbound = isInboundDirection(args.direction);
  const flow: "inbound" | "outbound" = inbound ? "inbound" : "outbound";
  const primaryWorkspace = args.workspaceNumbers.find((number) =>
    phonesLooselyMatch(number, inbound ? args.to : args.from),
  );
  const fallbackWorkspace = args.workspaceNumbers.find(
    (number) =>
      phonesLooselyMatch(number, args.from) || phonesLooselyMatch(number, args.to),
  );
  const callcasterNumber = primaryWorkspace ?? fallbackWorkspace ?? (inbound ? args.to : args.from);
  const otherCandidates = [args.from, args.to].filter(
    (value): value is string => Boolean(value),
  );
  const otherNumber =
    otherCandidates.find(
      (candidate) => !phonesLooselyMatch(candidate, callcasterNumber),
    ) ?? null;

  return { callcasterNumber, otherNumber, flow };
}

export function formatCallLogAgentName(args: {
  username?: string | null;
  first_name?: string | null;
} | null): string | null {
  if (!args) return null;
  const fullName = [args.first_name].filter(Boolean).join(" ").trim();
  if (fullName && args.username) return `${fullName} (${args.username})`;
  return fullName || args.username || null;
}

export function parseCallLogSearchParams(
  searchParams: URLSearchParams,
): CallLogSearchState {
  const rawSortKey = searchParams.get("sortKey");
  const sortKey = CALL_LOG_SORT_KEYS.includes(rawSortKey as CallLogSortKey)
    ? (rawSortKey as CallLogSortKey)
    : DEFAULT_SORT_KEY;
  const sortDirection =
    searchParams.get("sortDirection") === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(
        searchParams.get("pageSize") || String(CALL_LOG_DEFAULT_PAGE_SIZE),
        10,
      ) || CALL_LOG_DEFAULT_PAGE_SIZE,
    ),
  );
  const rawDirection = searchParams.get("direction");
  const direction: CallLogDirectionFilter =
    rawDirection === "inbound" || rawDirection === "outbound" ? rawDirection : "all";

  return {
    callcasterNumber: searchParams.get("callcasterNumber")?.trim() ?? "",
    otherNumber: searchParams.get("otherNumber")?.trim() ?? "",
    direction,
    disposition: searchParams.get("disposition")?.trim() ?? "",
    agentUserId: searchParams.get("agent")?.trim() ?? "",
    sortKey,
    sortDirection,
    page,
    pageSize,
  };
}

export function buildCallLogSearchParams(
  state: Partial<CallLogSearchState>,
  current?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(current ?? undefined);
  const setOrDelete = (key: string, value: string | undefined, defaultValue = "") => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed || trimmed === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, trimmed);
    }
  };

  setOrDelete("callcasterNumber", state.callcasterNumber);
  setOrDelete("otherNumber", state.otherNumber);
  if (state.direction && state.direction !== "all") {
    params.set("direction", state.direction);
  } else {
    params.delete("direction");
  }
  setOrDelete("disposition", state.disposition);
  setOrDelete("agent", state.agentUserId);

  if (state.sortKey && state.sortKey !== DEFAULT_SORT_KEY) {
    params.set("sortKey", state.sortKey);
  } else {
    params.delete("sortKey");
  }
  if (state.sortDirection && state.sortDirection !== DEFAULT_SORT_DIRECTION) {
    params.set("sortDirection", state.sortDirection);
  } else {
    params.delete("sortDirection");
  }
  if (state.page && state.page > 1) {
    params.set("page", String(state.page));
  } else {
    params.delete("page");
  }
  if (state.pageSize && state.pageSize !== CALL_LOG_DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  } else {
    params.delete("pageSize");
  }

  return params;
}
