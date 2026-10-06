import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { BillingReconciliationPanel } from "../../app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel";
import { buildBillingReconciliationReport } from "../../shared/billing-reconciliation";

function renderReport(mmsUsage: string, usageUnit = "messages") {
  const report = buildBillingReconciliationReport({
    period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    numberRentals: {
      period: { startDate: "2026-05-01", endDate: "2026-05-31" },
      ledgerRows: [], twilioUsage: [], history: [],
    },
    ledgerRows: [
      {
        type: "DEBIT",
        amount: -4,
        idempotency_key: "sms:SM1",
        note: "MMS SM1 delivered",
        created_at: "2026-05-10T12:00:00.000Z",
      },
    ],
    twilioUsage: [
      {
        category: "mms-outbound",
        description: "MMS",
        usage: mmsUsage,
        usageUnit,
        price: "0.01",
      },
    ],
    entityAudit: {
      billableMessages: 1,
      debitedMessages: 1,
      messageGap: 0,
      billableCalls: 0,
      debitedCalls: 0,
      callGap: 0,
      billedVoiceMinutes: 0,
    },
  });
  const router = createMemoryRouter([
    {
      path: "/",
      element: <BillingReconciliationPanel report={report} snapshot={null} />,
    },
  ]);
  render(<RouterProvider router={router} />);
}

describe("admin message reconciliation rows", () => {
  test("MMS has its own balanced row while SMS credits remain zero", () => {
    renderReport("1");
    const mms = screen.getByRole("row", { name: /^MMS / });
    expect(within(mms).getByText("1 messages")).toBeInTheDocument();
    expect(within(mms).getByText("4")).toBeInTheDocument();
    expect(within(mms).getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^SMS / })).toHaveTextContent(
      "0 segments",
    );
  });
  test("unsupported provider units cannot appear as a balanced MMS row", () => {
    renderReport("1", "bytes");
    const mms = screen.getByRole("row", { name: /^MMS / });
    expect(within(mms).getByText("Unsupported usage")).toBeInTheDocument();
    expect(within(mms).getByText("Unavailable")).toBeInTheDocument();
    expect(within(mms).queryByText("Balanced")).toBeNull();
  });
  test("real MMS drift has a variance badge in the MMS row", () => {
    renderReport("4");
    const mms = screen.getByRole("row", { name: /^MMS / });
    expect(within(mms).getByText("Variance +3")).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /^SMS / })).getByText("Balanced"),
    ).toBeInTheDocument();
  });
});
