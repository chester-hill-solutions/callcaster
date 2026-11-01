import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { WorkspaceNumberHistoryRow } from "@/lib/workspace-number-history.server";

const columns: ColumnDef<WorkspaceNumberHistoryRow>[] = [
  {
    accessorKey: "phone_number",
    header: "Number",
    cell: ({ row }) => row.original.phone_number ?? "Unknown number",
  },
  {
    accessorKey: "friendly_name",
    header: "Name",
    cell: ({ row }) => row.original.friendly_name ?? "—",
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) =>
      row.original.type === "caller_id" ? "Caller ID" : "Phone number",
  },
  {
    accessorKey: "released_at",
    header: "Released",
    cell: ({ row }) => (
      <time dateTime={row.original.released_at}>
        {new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(row.original.released_at))}
      </time>
    ),
  },
];
const PAGE_SIZE = 10;

export function NumberHistory({ rows }: { rows: WorkspaceNumberHistoryRow[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  return (
    <Section variant="flat" className="min-w-0">
      <SectionHeader
        branded={false}
        compact
        title="Released number history"
        description="Read-only records. These numbers cannot be used for calls or messages and have no further rental charges."
      />
      <DataTable
        columns={columns}
        data={rows.slice(
          (currentPage - 1) * PAGE_SIZE,
          currentPage * PAGE_SIZE,
        )}
        emptyState={<p>No released numbers.</p>}
        pagination={{
          currentPage,
          totalPages,
          onPageChange: setPage,
          totalCount: rows.length,
          pageSize: PAGE_SIZE,
        }}
      />
    </Section>
  );
}
