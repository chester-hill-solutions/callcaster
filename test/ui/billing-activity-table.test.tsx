import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { BillingActivityTable } from "../../app/components/workspace/BillingActivityTable";

const history = [
  {
    id: "purchase-1",
    created_at: "2026-07-16T12:00:00.000Z",
    type: "CREDIT" as const,
    amount: 500,
    note: "Added 500 credits, stripe_session:cs_test_123",
    idempotency_key: "stripe_session:cs_test_123",
  },
];

describe("BillingActivityTable", () => {
  test("shows only the customer-facing columns by default", () => {
    render(<BillingActivityTable history={history} />);

    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Amount" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Source" })).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Idempotency key" }),
    ).toBeNull();

    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
    expect(screen.getByText("+500 credits")).toBeInTheDocument();
    expect(screen.queryByText("Stripe")).toBeNull();
    expect(screen.queryByText("cs_test_123")).toBeNull();
    expect(screen.queryByText(history[0].note)).toBeNull();
  });

  test("reveals support details through an accessible Advanced disclosure", async () => {
    const user = userEvent.setup();
    render(<BillingActivityTable history={history} />);

    const trigger = screen.getByRole("button", {
      name: "Advanced details for Credit purchase",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("cs_test_123")).toBeInTheDocument();
    expect(
      screen.getByText("stripe_session:cs_test_123"),
    ).toBeInTheDocument();
    expect(screen.getByText(history[0].note)).toBeInTheDocument();
  });

  test("preserves the activity empty state", () => {
    render(<BillingActivityTable history={[]} />);

    expect(
      screen.getByText("Purchases and campaign activity will appear here."),
    ).toBeInTheDocument();
  });
});
