import { browserTimeZone } from "@/lib/schedule-timezone";
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
};

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
}: {
  row: BillingActivityRow;
  nested?: boolean;
}) {
  const activity = projectBillingActivity(row);

  return (
    <TableRow className={nested ? "bg-muted/20" : undefined}>
      <TableCell className={cn("whitespace-nowrap align-top", nested && "pl-8")}>
        {new Date(activity.occurredAt).toLocaleString()}
      </TableCell>
      <TableCell className="min-w-64 align-top">
        <div className="font-medium">{activity.activity}</div>
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

export function BillingActivityTable({
  history,
  campaignNames,
}: BillingActivityTableProps) {
  const items = useMemo(
    () => rollUpBillingActivity(history, { campaignNames }),
    [history, campaignNames],
  );

  return (
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
                <Text variant="muted">
                  Purchases and campaign activity will appear here.
                </Text>
              </TableCell>
            </TableRow>
          ) : null}
          {items.map((item) =>
            item.kind === "group" ? (
              <ActivityGroupRows key={item.key} group={item} />
            ) : (
              <ActivityEntryRow key={item.row.id} row={item.row} />
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
