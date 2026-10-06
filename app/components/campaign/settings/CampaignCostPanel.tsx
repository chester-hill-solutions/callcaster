import { Section, SectionHeader } from "@/components/shared/Section";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import { formatCredits, formatCurrency } from "@/lib/billing-format";
import { CREDIT_PRICE_CAD } from "@/lib/pricing";

type CampaignCostPanelProps = {
  billing: CampaignBillingSummary;
  completedCount: number;
};

export function CampaignCostPanel({
  billing,
  completedCount,
}: CampaignCostPanelProps) {
  const actualCad = billing.actualDebitCredits * CREDIT_PRICE_CAD;
  const estimateCad = billing.estimate.totalCredits * CREDIT_PRICE_CAD;

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Campaign cost"
        description="Estimated remaining send cost; actual charges come from the credit ledger."
      />

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{billing.estimate.rateDescription}</p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Estimated remaining</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCredits(billing.estimate.totalCredits)} credits
            </div>
            <div className="text-xs text-muted-foreground">
              {billing.estimate.contactCount.toLocaleString()} contacts ·{" "}
              {billing.estimate.perContactCredits.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              credits/contact on average ({formatCurrency(estimateCad)})
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
      </div>
    </Section>
  );
}
