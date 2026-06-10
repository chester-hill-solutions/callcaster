import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import { formatCredits, formatCurrency } from "@/lib/billing-format";
import { CREDIT_PRICE_CAD } from "@/lib/pricing";

type CampaignCostPanelProps = {
  billing: CampaignBillingSummary;
  queuedCount: number;
  completedCount: number;
};

export function CampaignCostPanel({
  billing,
  queuedCount,
  completedCount,
}: CampaignCostPanelProps) {
  const actualCad = billing.actualDebitCredits * CREDIT_PRICE_CAD;
  const estimateCad = billing.estimate.totalCredits * CREDIT_PRICE_CAD;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign cost</CardTitle>
        <CardDescription>
          Option B rates — estimates use queued contacts; actuals come from the credit ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{billing.estimate.rateDescription}</p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Estimated (queued)</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(billing.estimate.totalCredits)} credits
            </div>
            <div className="text-xs text-muted-foreground">
              {queuedCount.toLocaleString()} contacts × {billing.estimate.perContactCredits}{" "}
              ({formatCurrency(estimateCad)})
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Actual debits</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(billing.actualDebitCredits)} credits
            </div>
            <div className="text-xs text-muted-foreground">{formatCurrency(actualCad)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">SMS ledger</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(billing.smsDebitCredits)} credits
            </div>
            <div className="text-xs text-muted-foreground">
              {billing.smsDebitEvents.toLocaleString()} events
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Voice ledger</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(billing.voiceDebitCredits)} credits
            </div>
            <div className="text-xs text-muted-foreground">
              {billing.voiceDebitEvents.toLocaleString()} events
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Completed or dequeued contacts: {completedCount.toLocaleString()}. Voice actuals include
          per-minute charges beyond the first-minute dial estimate.
        </p>
      </CardContent>
    </Card>
  );
}
