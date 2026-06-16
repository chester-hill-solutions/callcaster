import { Link, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";

import { DataTable } from "@/components/workspace/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CallLogRow } from "@/lib/call-log.server";
import { formatDateToLocale } from "@/lib/utils";
import {
  buildCallLogSearchParams,
  type CallLogDirectionFilter,
  type CallLogSortKey,
} from "../../../shared/call-log";
import type { ColumnDef } from "@tanstack/react-table";

const ALL_NUMBERS_VALUE = "all";
const ALL_AGENTS_VALUE = "all";

type CallLogTableProps = {
  rows: CallLogRow[];
  workspaceId: string;
  workspaceNumbers: Array<{ id: number; phone_number: string | null }>;
  agents: Array<{ id: string; label: string }>;
  sorting: {
    sortKey: CallLogSortKey;
    sortDirection: "asc" | "desc";
  };
  filters: {
    callcasterNumber: string;
    otherNumber: string;
    direction: CallLogDirectionFilter;
    disposition: string;
    agentUserId: string;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
};

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc";
}) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
  return direction === "asc" ? (
    <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  );
}

export function CallLogTable({
  rows,
  workspaceId,
  workspaceNumbers,
  agents,
  sorting,
  filters,
  pagination,
}: CallLogTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = (patch: Parameters<typeof buildCallLogSearchParams>[0]) => {
    setSearchParams(buildCallLogSearchParams(patch, searchParams));
  };

  const handleSort = (sortKey: CallLogSortKey) => {
    const nextDirection =
      sorting.sortKey === sortKey && sorting.sortDirection === "asc" ? "desc" : "asc";
    updateParams({
      ...filters,
      sortKey,
      sortDirection: nextDirection,
      page: 1,
      pageSize: pagination.pageSize,
    });
  };

  const hasActiveFilters =
    Boolean(filters.callcasterNumber) ||
    Boolean(filters.otherNumber) ||
    filters.direction !== "all" ||
    Boolean(filters.disposition) ||
    Boolean(filters.agentUserId);

  const callcasterNumberInList = workspaceNumbers.some(
    (number) => number.phone_number === filters.callcasterNumber,
  );
  const callcasterSelectValue = filters.callcasterNumber
    ? callcasterNumberInList
      ? filters.callcasterNumber
      : ALL_NUMBERS_VALUE
    : ALL_NUMBERS_VALUE;

  const columns: ColumnDef<CallLogRow>[] = [
      {
        accessorKey: "dateCreated",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("date_created")}
          >
            Date
            <SortIndicator
              active={sorting.sortKey === "date_created"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => formatDateToLocale(row.original.dateCreated),
      },
      {
        accessorKey: "callcasterNumber",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("callcaster_number")}
          >
            CallCaster Number
            <SortIndicator
              active={sorting.sortKey === "callcaster_number"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => row.original.callcasterNumber ?? "—",
      },
      {
        accessorKey: "otherNumber",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("other_number")}
          >
            Other Number
            <SortIndicator
              active={sorting.sortKey === "other_number"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => row.original.otherNumber ?? "—",
      },
      {
        accessorKey: "direction",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("direction")}
          >
            Direction
            <SortIndicator
              active={sorting.sortKey === "direction"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.direction === "inbound" ? "secondary" : "outline"}>
            {row.original.direction}
          </Badge>
        ),
      },
      {
        accessorKey: "disposition",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("disposition")}
          >
            Disposition
            <SortIndicator
              active={sorting.sortKey === "disposition"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => row.original.disposition ?? "—",
      },
      {
        accessorKey: "agentName",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center font-semibold"
            onClick={() => handleSort("agent")}
          >
            Agent
            <SortIndicator
              active={sorting.sortKey === "agent"}
              direction={sorting.sortDirection}
            />
          </button>
        ),
        cell: ({ row }) => row.original.agentName ?? "—",
      },
      {
        id: "voicemail",
        header: "Voicemail",
        cell: ({ row }) => {
          if (row.original.recordingUrl) {
            return (
              <a
                href={row.original.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Listen
              </a>
            );
          }
          return (
            <Link
              to={`/workspaces/${workspaceId}/voicemails`}
              className="text-muted-foreground underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              Voicemails
            </Link>
          );
        },
      },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      toolbar={
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Select
              value={callcasterSelectValue}
              onValueChange={(value) =>
                updateParams({
                  ...filters,
                  callcasterNumber: value === ALL_NUMBERS_VALUE ? "" : value,
                  page: 1,
                  pageSize: pagination.pageSize,
                  sortKey: sorting.sortKey,
                  sortDirection: sorting.sortDirection,
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="CallCaster number" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_NUMBERS_VALUE}>All CallCaster numbers</SelectItem>
                {workspaceNumbers.map((number) => (
                  <SelectItem
                    key={number.id}
                    value={number.phone_number ?? String(number.id)}
                  >
                    {number.phone_number ?? `Number ${number.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="w-[200px]"
              placeholder="Other number"
              value={filters.otherNumber}
              onChange={(event) =>
                updateParams({
                  ...filters,
                  otherNumber: event.target.value,
                  page: 1,
                  pageSize: pagination.pageSize,
                  sortKey: sorting.sortKey,
                  sortDirection: sorting.sortDirection,
                })
              }
            />

            <Select
              value={filters.direction}
              onValueChange={(value: CallLogDirectionFilter) =>
                updateParams({
                  ...filters,
                  direction: value,
                  page: 1,
                  pageSize: pagination.pageSize,
                  sortKey: sorting.sortKey,
                  sortDirection: sorting.sortDirection,
                })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>

            <Input
              className="w-[180px]"
              placeholder="Disposition"
              value={filters.disposition}
              onChange={(event) =>
                updateParams({
                  ...filters,
                  disposition: event.target.value,
                  page: 1,
                  pageSize: pagination.pageSize,
                  sortKey: sorting.sortKey,
                  sortDirection: sorting.sortDirection,
                })
              }
            />

            <Select
              value={filters.agentUserId || ALL_AGENTS_VALUE}
              onValueChange={(value) =>
                updateParams({
                  ...filters,
                  agentUserId: value === ALL_AGENTS_VALUE ? "" : value,
                  page: 1,
                  pageSize: pagination.pageSize,
                  sortKey: sorting.sortKey,
                  sortDirection: sorting.sortDirection,
                })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_AGENTS_VALUE}>All agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSearchParams(
                    buildCallLogSearchParams({
                      sortKey: sorting.sortKey,
                      sortDirection: sorting.sortDirection,
                      page: 1,
                      pageSize: pagination.pageSize,
                    }),
                  )
                }
              >
                <X className="mr-1 h-4 w-4" />
                Clear filters
              </Button>
            ) : null}
          </div>

          {pagination.totalCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} to{" "}
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)} of{" "}
              {pagination.totalCount} calls
            </p>
          ) : null}
        </div>
      }
      emptyState="No calls match the current filters."
      pagination={{
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalCount: pagination.totalCount,
        pageSize: pagination.pageSize,
        onPageChange: (page) =>
          updateParams({
            ...filters,
            page,
            pageSize: pagination.pageSize,
            sortKey: sorting.sortKey,
            sortDirection: sorting.sortDirection,
          }),
      }}
    />
  );
}
