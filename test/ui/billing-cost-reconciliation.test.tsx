import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { BillingReconciliationPanel } from "../../app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel";
import { buildBillingReconciliationReport } from "../../shared/billing-reconciliation";

const period = { startDate: "2026-09-06", endDate: "2026-10-06" };
describe("admin full-account cost display (#2426)", () => {
  test.each([
    { name: "known", price: "4.20", expected: "$4.20" },
    { name: "zero", price: "0", expected: "$0.00" },
    { name: "unknown", price: null, expected: "Unavailable" },
  ])("shows the $name cost in the existing summary", ({ price, expected }) => {
    const report = buildBillingReconciliationReport({
      period,
      ledgerRows: [],
      twilioUsage:
        price === null
          ? []
          : [
              {
                category: "totalprice",
                description: "All usage",
                usage: price,
                usageUnit: "usd",
                price,
                priceUnit: "usd",
                ...period,
              },
            ],
      entityAudit: {
        billableMessages: 0,
        debitedMessages: 0,
        messageGap: 0,
        billableCalls: 0,
        debitedCalls: 0,
        callGap: 0,
        billedVoiceMinutes: 0,
      },
      numberRentals: {
        period: { startDate: "2026-09-01", endDate: "2026-09-30" },
        twilioUsage: [],
        ledgerRows: [],
        history: [],
      },
    });
    const router = createMemoryRouter([
      {
        path: "/",
        element: <BillingReconciliationPanel report={report} snapshot={null} />,
      },
    ]);
    render(<RouterProvider router={router} />);
    const cell = screen.getByText("Twilio cost (USD)").parentElement;
    if (!cell) throw new Error("Missing cost summary cell");
    expect(within(cell).getByText(expected)).toBeInTheDocument();
    expect(screen.getByText("Ledger debits (credits)")).toBeInTheDocument();
    expect(
      screen.getByText(/SMS, MMS and voice: 2026-09-06 through 2026-10-06/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
