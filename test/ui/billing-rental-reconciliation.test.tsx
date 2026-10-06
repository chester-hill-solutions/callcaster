import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { BillingReconciliationPanel } from "../../app/routes/admin+/workspaces/$workspaceId/twilio/AdminTwilioPortal.BillingReconciliationPanel";
import {
  buildBillingReconciliationReport,
  buildBillingReconciliationSnapshot,
} from "../../shared/billing-reconciliation";

function renderRental(units: number, credits: number, unit = "numbers") {
  const rentalPeriod = { startDate: "2026-09-01", endDate: "2026-09-30" };
  const report = buildBillingReconciliationReport({
    period: { startDate: "2026-09-06", endDate: "2026-10-06" },
    ledgerRows: [],
    twilioUsage: [],
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
      period: rentalPeriod,
      twilioUsage: [
        {
          category: "phonenumbers-local",
          description: "Local rentals",
          usage: String(units),
          usageUnit: unit,
          price: "0",
          startDate: rentalPeriod.startDate,
          endDate: rentalPeriod.endDate,
        },
        {
          category: "phonenumbers-setups",
          description: "Setups",
          usage: "0",
          usageUnit: "number-setups",
          price: "0",
          startDate: rentalPeriod.startDate,
          endDate: rentalPeriod.endDate,
        },
      ],
      ledgerRows: credits
        ? [
            {
              type: "DEBIT",
              amount: -credits,
              idempotency_key: "number_rent:1:2026-09",
              created_at: "2026-10-06T00:00:00Z",
            },
          ]
        : [],
      history: Array.from({ length: units }, (_, i) => ({
        id: i + 1,
        createdAt: "2026-08-10T00:00:00Z",
      })),
    },
  });
  const snapshot = buildBillingReconciliationSnapshot(report, "admin");
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <BillingReconciliationPanel report={report} snapshot={snapshot} />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
  return screen.getByRole("row", { name: /^Number renewals / });
}

describe("admin rental reconciliation display (#2113)", () => {
  test("one paid renewal is balanced and states its own month", () => {
    const row = renderRental(1, 100);
    expect(within(row).getByText("1 renewals")).toBeInTheDocument();
    expect(within(row).getByText("Balanced")).toBeInTheDocument();
    expect(
      screen.getByText(
        /SMS, MMS and voice: 2026-09-06 through 2026-10-06\. Number renewals: 2026-09-01 through 2026-09-30\./,
      ),
    ).toBeInTheDocument();
  });
  test("positive rental drift uses the existing variance badge", () => {
    const row = renderRental(3, 0);
    expect(within(row).getByText("Variance +3")).toBeInTheDocument();
    expect(screen.getByText("Material variance")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  test("unsupported rental units cannot be displayed as balanced", () => {
    const row = renderRental(1, 100, "number-months");
    expect(within(row).getByText("Unavailable")).toBeInTheDocument();
    expect(within(row).queryByText("Balanced")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
