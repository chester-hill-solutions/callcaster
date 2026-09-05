import { browserTimeZone } from "@/lib/schedule-timezone";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import {
  formatSignedCreditAmount,
  projectBillingActivity,
  type BillingActivityRow,
} from "@/lib/billing-activity-projection";
import {
  rollUpBillingActivity,
  type BillingActivityGroupItem,
} from "@/lib/billing-activity-rollup";
import { cn } from "@/lib/utils";

type BillingActivityTableProps = {
  history: BillingActivityRow[];
  campaignNames?: Record<number, string>;
  /** When set, Stripe purchases link to their hosted receipt (#1322). */
  workspaceId?: string;
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
  return direction === "credit" ? "text-success" : "text-destructive";
}

function ActivityEntryRow({
  row,
  nested = false,
  receiptHref = null,
}: {
  row: BillingActivityRow;
  nested?: boolean;
  receiptHref?: string | null;
}) {
  const activity = projectBillingActivity(row);

  return (
    <TableRow className={nested ? "bg-muted/20" : undefined}>
      <TableCell className={cn("whitespace-nowrap align-top", nested && "pl-8")}>
        {new Date(activity.occurredAt).toLocaleString()}
      </TableCell>
      <TableCell className="min-w-64 align-top">
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
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="w-fit gap-1 py-1 text-xs font-normal text-muted-foreground hover:no-underline">
              <span aria-hidden="true">Advanced</span>
              <span className="sr-only">
                Advanced details for {activity.activity}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <dl className="grid gap-3 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-2">
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
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
  );
}

function formatDateRange(firstAt: string, lastAt: string): string {
  const first = new Date(firstAt).toLocaleDateString();
  const last = new Date(lastAt).toLocaleDateString();
  return first === last ? first : `${first} – ${last}`;
}

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
            className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
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
      {open
        ? group.entries.map((row) => (
            <ActivityEntryRow key={row.id} row={row} nested />
          ))
        : null}
    </>
  );
}

export type BillingActivityFilter = "all" | "purchases" | "usage";

const ACTIVITY_FILTERS: ReadonlyArray<{ id: BillingActivityFilter; label: string }> = [
  { id: "all", label: "All activity" },
  { id: "purchases", label: "Purchases and credits" },
  { id: "usage", label: "Usage" },
];

function matchesActivityFilter(row: BillingActivityRow, filter: BillingActivityFilter): boolean {
  if (filter === "purchases") return row.type === "CREDIT";
  if (filter === "usage") return row.type === "DEBIT";
  return true;
}

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
  history,
  campaignNames,
  workspaceId,
}: BillingActivityTableProps) {
  const [filter, setFilter] = useState<BillingActivityFilter>("all");
  const items = useMemo(
    () =>
      rollUpBillingActivity(
        history.filter((row) => matchesActivityFilter(row, filter)),
        { campaignNames },
      ),
    [history, campaignNames, filter],
  );

  return (
    <div className="overflow-x-auto">
      <ActivityFilterBar value={filter} onChange={setFilter} />
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
  );
}
