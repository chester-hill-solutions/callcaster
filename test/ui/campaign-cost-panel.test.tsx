import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CampaignCostPanel } from "@/components/campaign/settings/CampaignCostPanel";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";

function billing(contactCount: number, totalCredits: number): CampaignBillingSummary {
  return {
    estimate: {
      contactCount, totalCredits, perContactCredits: contactCount ? totalCredits / contactCount : 0,
      rateDescription: "Personalized queued messages: 2 credits per SMS segment; 4 credits per MMS message.",
    },
    actualDebitCredits: 12, smsDebitCredits: 12, voiceDebitCredits: 0, smsDebitEvents: 3, voiceDebitEvents: 0,
  };
}

describe("campaign cost panel", () => {
  test("labels a mixed per-recipient cost as an average, while keeping its exact total", () => {
    render(<CampaignCostPanel billing={billing(3, 10)} completedCount={2} />);
    expect(screen.getByText("Estimated remaining")).toBeInTheDocument();
    expect(screen.getByText("10 credits")).toBeInTheDocument();
    expect(screen.getByText(/3 contacts · 3\.33 credits\/contact on average/)).toBeInTheDocument();
    expect(screen.getAllByText("12 credits")).toHaveLength(2);
    expect(screen.getByText("Voice ledger")).toBeInTheDocument();
    expect(screen.getByText(/Completed or dequeued contacts: 2/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("keeps the estimate and existing ledger cards for an empty queue", () => {
    render(<CampaignCostPanel billing={billing(0, 0)} completedCount={3} />);
    expect(screen.getAllByText("0 credits")).toHaveLength(2);
    expect(screen.getByText(/0 contacts · 0 credits\/contact on average/)).toBeInTheDocument();
    expect(screen.getByText("Actual debits")).toBeInTheDocument();
    expect(screen.getByText("SMS ledger")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
