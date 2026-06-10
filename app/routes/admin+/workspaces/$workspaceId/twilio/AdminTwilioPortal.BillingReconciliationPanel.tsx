import { Form } from "react-router";
import { RefreshCw, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import type { BillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";

type BillingReconciliationPanelProps = {
  report: BillingReconciliationReport | null;
  snapshot: BillingReconciliationSnapshot | null;
};

function varianceBadge(variance: number) {
  if (variance === 0) {
    return <Badge variant="secondary">Balanced</Badge>;
  }
  if (Math.abs(variance) <= 2) {
    return <Badge variant="outline">Minor ({variance > 0 ? "+" : ""}{variance})</Badge>;
  }
  return (
    <Badge variant="destructive">
      Variance {variance > 0 ? "+" : ""}
      {variance}
    </Badge>
  );
}

export function BillingReconciliationPanel({
  report,
  snapshot,
}: BillingReconciliationPanelProps) {
  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Reconciliation</CardTitle>
          <CardDescription>
            Compare Twilio usage records to ledger debits for the last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reconciliation data is unavailable for this workspace (missing Twilio credentials or query error).
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = [
    { label: "SMS", data: report.categories.sms },
    { label: "Voice", data: report.categories.voice },
    { label: "Phone numbers", data: report.categories.numbers },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Billing Reconciliation</CardTitle>
            <CardDescription>
              Twilio vs ledger for {report.period.startDate} through {report.period.endDate}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Form method="post">
              <input type="hidden" name="_action" value="run_billing_reconciliation" />
              <Button variant="outline" type="submit" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Run reconciliation
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="_action" value="trigger_twilio_open_sync" />
              <Button variant="outline" type="submit" size="sm">
                <RotateCcw className="mr-2 h-4 w-4" />
                Repair open sync
              </Button>
            </Form>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {snapshot?.lastRunAt ? (
          <div className="rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Last recorded run</span>
              <Badge variant={snapshot.materialVariance ? "destructive" : "secondary"}>
                {snapshot.materialVariance ? "Material variance" : "Balanced"}
              </Badge>
              <Badge variant="outline">{snapshot.lastRunSource}</Badge>
            </div>
            <div className="mt-2 font-medium">{new Date(snapshot.lastRunAt).toLocaleString()}</div>
            <p className="mt-2 text-muted-foreground">
              Nightly cron writes snapshots when drift is detected. Use repair actions above to backfill
              missed webhooks or refresh the report after fixes.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No reconciliation snapshot stored yet. Run reconciliation to record a baseline, or wait for the
            nightly cron after deploy.
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Twilio</TableHead>
              <TableHead className="text-right">Ledger events</TableHead>
              <TableHead className="text-right">Ledger credits</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ label, data }) => (
              <TableRow key={label}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell className="text-right">
                  {data.twilioUnits.toLocaleString()} {data.twilioUnitLabel}
                </TableCell>
                <TableCell className="text-right">{data.ledgerEvents.toLocaleString()}</TableCell>
                <TableCell className="text-right">{data.ledgerCredits.toLocaleString()}</TableCell>
                <TableCell className="text-right">{varianceBadge(data.variance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Twilio cost (USD)</div>
            <div className="mt-1 text-lg font-semibold">
              ${report.twilioTotalCostUsd.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Ledger debits (credits)</div>
            <div className="mt-1 text-lg font-semibold">
              {report.ledgerDebitCredits.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Credit purchases</div>
            <div className="mt-1 text-lg font-semibold">
              {report.ledgerCreditPurchases.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Unrecognized debits</div>
            <div className="mt-1 text-lg font-semibold">
              {report.unrecognizedDebitEvents.toLocaleString()}
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Entity audit (DB vs ledger)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Billable rows</TableHead>
                <TableHead className="text-right">Ledger debits</TableHead>
                <TableHead className="text-right">Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Outbound SMS/MMS</TableCell>
                <TableCell className="text-right">
                  {report.entityAudit.billableMessages.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {report.entityAudit.debitedMessages.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {varianceBadge(report.entityAudit.messageGap)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Terminal calls</TableCell>
                <TableCell className="text-right">
                  {report.entityAudit.billableCalls.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {report.entityAudit.debitedCalls.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {varianceBadge(report.entityAudit.callGap)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-sm text-muted-foreground">
            Positive gaps suggest billable activity without a matching ledger debit. Use Repair open sync to
            backfill stale SMS/call statuses, then re-run reconciliation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
