import { browserTimeZone } from "@/lib/schedule-timezone";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import TablePagination from "@/components/shared/TablePagination";
import {
  formatSignedCreditAmount,
  projectBillingActivity,
  type BillingActivityFilter,
  type BillingActivityRow,
} from "@/lib/billing-activity-projection";
import type { BillingActivityGroupItem, BillingActivityItem } from "@/lib/billing-activity-rollup";
import { cn } from "@/lib/utils";

type BillingActivityTableProps = {
  /** Pre-rolled ledger items for this page (groups + lone entries). */
  items: BillingActivityItem[];
  /** When set, Stripe purchases link to their hosted receipt (#1322). */
  workspaceId?: string;
  /** Active activity filter, owned by the route so pages and counts agree. */
  filter: BillingActivityFilter;
  onFilterChange: (filter: BillingActivityFilter) => void;
  /** Server-side pagination over rolled-up items; omitted hides the pager. */
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
};

function receiptHrefFor(workspaceId: string | undefined, row: BillingActivityRow): string | null {
  if (!workspaceId || row.type !== "CREDIT") return null;
  const key = row.idempotency_key ?? "";
  if (!key.startsWith("stripe_session:") && !key.startsWith("stripe_evt:")) return null;
  return `/api/workspaces/${workspaceId}/billing/receipt?transaction=${encodeURIComponent(row.id)}`;
}

function SupportDetail({
  label,
  value,
  monospaced = false,
}: {
  label: string;
  value: string | null;
  monospaced?: boolean;
}) {
  return (
    <div>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd
        className={
          monospaced
            ? "break-all font-mono text-xs text-muted-foreground"
            : "break-words text-muted-foreground"
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function amountClassName(direction: "credit" | "debit"): string {
  return direction === "credit" ? "text-success-text" : "text-destructive-text";
}

/**
 * One ledger entry row plus an inline disclosure row. The details are a
 * colSpan row directly below — never an accordion inside the Activity cell,
 * which used to distort the table columns when expanded.
 */
function ActivityEntryRow({
  row,
  receiptHref = null,
}: {
  row: BillingActivityRow;
  receiptHref?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const activity = projectBillingActivity(row);

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap align-top">
          {new Date(activity.occurredAt).toLocaleString()}
        </TableCell>
        <TableCell className="min-w-64 align-top">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="font-medium">{activity.activity}</div>
              {receiptHref ? (
                <a
                  href={receiptHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline underline-offset-4"
                >
                  Receipt
                  <span className="sr-only"> for {activity.activity} on {new Date(activity.occurredAt).toLocaleDateString()}</span>
                </a>
              ) : null}
            </div>
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Hide details" : "Show details"}
              onClick={() => setOpen((value) => !value)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </TableCell>
        <TableCell
          className={cn(
            "whitespace-nowrap text-right align-top font-medium",
            amountClassName(activity.direction),
          )}
        >
          {activity.amount}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={3} className="py-2 pl-8 pr-4">
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <SupportDetail
                label="Provider"
                value={activity.advanced.provider}
              />
              <SupportDetail
                label="Reference"
                value={activity.advanced.reference}
                monospaced
              />
              <SupportDetail
                label="Idempotency key"
                value={activity.advanced.idempotencyKey}
                monospaced
              />
              <SupportDetail label="Raw note" value={activity.advanced.rawNote} />
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function formatDateRange(firstAt: string, lastAt: string): string {
  const first = new Date(firstAt).toLocaleDateString();
  const last = new Date(lastAt).toLocaleDateString();
  return first === last ? first : `${first} – ${last}`;
}

/**
 * A campaign/period summary row plus a nested sub-table (own header columns)
 * holding the underlying entries. The sub-table lives inside one colSpan row,
 * so expanding never injects rows into the parent grid or moves its columns.
 */
function ActivityGroupRows({ group }: { group: BillingActivityGroupItem }) {
  const [open, setOpen] = useState(false);
  const entryLabel = `${group.entryCount} entries`;

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap align-top">
          {formatDateRange(group.firstAt, group.lastAt)}
        </TableCell>
        <TableCell className="min-w-64 align-top">
          <div className="font-medium">{group.campaignName}</div>
          <Text variant="muted" className="text-xs">
            {group.periodLabel} · {entryLabel} · {group.activities.join(", ")}
          </Text>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? "Hide" : "Show"} {entryLabel}
            <span className="sr-only">
              {" "}
              for {group.campaignName}, {group.periodLabel}
            </span>
          </button>
        </TableCell>
        <TableCell
          className={cn(
            "whitespace-nowrap text-right align-top font-medium",
            amountClassName("debit"),
          )}
        >
          {formatSignedCreditAmount("DEBIT", group.totalAmount)}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={3} className="bg-muted/20 p-0">
            <div className="max-h-96 overflow-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date ({browserTimeZone()})</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.entries.map((row) => (
                    <ActivityEntryRow key={row.id} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export type { BillingActivityFilter } from "@/lib/billing-activity-projection";

const ACTIVITY_FILTERS: ReadonlyArray<{ id: BillingActivityFilter; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "purchases", label: "Purchases and credits" },
  { id: "usage", label: "Usage" },
];

function emptyCopyFor(filter: BillingActivityFilter): string {
  if (filter === "purchases") return "No purchases or credits yet.";
  if (filter === "usage") return "No usage yet.";
  return "Purchases and campaign activity will appear here.";
}

/** Purchases vs usage split (#1322, first slice): a ledger with months of usage buries the receipts. */
function ActivityFilterBar({
  value,
  onChange,
}: {
  value: BillingActivityFilter;
  onChange: (next: BillingActivityFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter activity" className="mb-3 flex flex-wrap gap-2">
      {ACTIVITY_FILTERS.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={value === option.id ? "default" : "outline"}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function BillingActivityTable({
  items,
  workspaceId,
  filter,
  onFilterChange,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: BillingActivityTableProps) {
  return (
    <div className="space-y-3">
      <ActivityFilterBar value={filter} onChange={onFilterChange} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date ({browserTimeZone()})</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center">
                  <Text variant="muted">{emptyCopyFor(filter)}</Text>
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((item) =>
              item.kind === "group" ? (
                <ActivityGroupRows key={item.key} group={item} />
              ) : (
                <ActivityEntryRow
                  key={item.row.id}
                  row={item.row}
                  receiptHref={receiptHrefFor(workspaceId, item.row)}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>
      {currentPage != null &&
      totalPages != null &&
      totalPages > 1 &&
      onPageChange ? (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          totalCount={totalCount}
          pageSize={pageSize}
          showSummary
        />
      ) : null}
    </div>
  );
}