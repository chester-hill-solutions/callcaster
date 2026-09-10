import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";

import { BillingActivityTable } from "../../app/components/workspace/BillingActivityTable";
import type { BillingActivityRow } from "../../app/lib/billing-activity-projection";

const history: BillingActivityRow[] = [
  {
    id: "purchase-1",
    created_at: "2026-07-16T12:00:00.000Z",
    type: "CREDIT",
    amount: 500,
    note: "Added 500 credits, stripe_session:cs_test_123",
    idempotency_key: "stripe_session:cs_test_123",
  },
];

const campaignHistory: BillingActivityRow[] = [
  ...history,
  {
    id: "sms-1",
    created_at: "2026-08-20T12:00:00.000Z",
    type: "DEBIT",
    amount: -1,
    note: "SMS SM1 delivered (1 segment)",
    idempotency_key: "sms:SM1",
    campaign_id: 12,
  },
  {
    id: "call-1",
    created_at: "2026-08-18T12:00:00.000Z",
    type: "DEBIT",
    amount: -2,
    note: "Call CA1, Contact 5, Outreach Attempt 9",
    idempotency_key: "call:CA1",
    campaign_id: 12,
  },
  {
    id: "sms-2",
    created_at: "2026-08-03T12:00:00.000Z",
    type: "DEBIT",
    amount: -1,
    note: "SMS SM2 delivered (1 segment)",
    idempotency_key: "sms:SM2",
    campaign_id: 12,
  },
  {
    id: "rent-1",
    created_at: "2026-08-01T12:00:00.000Z",
    type: "DEBIT",
    amount: -100,
    note: "Monthly rental for +14165550123",
    idempotency_key: "number_rent:42:2026-08",
    campaign_id: null,
  },
];

function renderTable(props: Partial<React.ComponentProps<typeof BillingActivityTable>> = {}) {
  render(
    <BillingActivityTable
      history={props.history ?? history}
      campaignNames={props.campaignNames}
      workspaceId={props.workspaceId}
      filter={props.filter ?? "all"}
      onFilterChange={props.onFilterChange ?? (() => undefined)}
      currentPage={props.currentPage}
      totalPages={props.totalPages}
      totalCount={props.totalCount}
      pageSize={props.pageSize}
      onPageChange={props.onPageChange}
    />,
  );
}

/** Mirrors the server-side filter the loader applies, so the client filter bar
 *  tests the real data path (history arrives already filtered by type). */
function FilterHarness({ full }: { full: BillingActivityRow[] }) {
  const [filter, setFilter] = useState<"all" | "purchases" | "usage">("all");
  const shown =
    filter === "purchases"
      ? full.filter((row) => row.type === "CREDIT")
      : filter === "usage"
        ? full.filter((row) => row.type === "DEBIT")
        : full;
  return (
    <BillingActivityTable
      history={shown}
      campaignNames={{ 12: "Fall drive" }}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}

describe("BillingActivityTable", () => {
  test("shows only the customer-facing columns by default", () => {
    renderTable();

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(screen.getByRole("columnheader", { name: `Date (${zone})` })).toBeInTheDocument();
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
    renderTable();

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
    renderTable({ history: [] });

    expect(
      screen.getByText("Purchases and campaign activity will appear here."),
    ).toBeInTheDocument();
  });

  test("rolls a campaign's usage for one period into a single summary row", () => {
    renderTable({ history: campaignHistory, campaignNames: { 12: "Fall outreach" } });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const summary = rows[0];
    expect(within(summary).getByText("Fall outreach")).toBeInTheDocument();
    expect(
      within(summary).getByText(
        "August 2026 · 3 entries · SMS messaging, Voice calling",
      ),
    ).toBeInTheDocument();
    expect(within(summary).getByText("−4 credits")).toBeInTheDocument();

    expect(screen.queryByText("SMS messaging")).toBeNull();
    expect(screen.queryByText("Voice calling")).toBeNull();
    expect(screen.getByText("Phone number rental")).toBeInTheDocument();
    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
  });

  test("expands a summary row to the underlying ledger entries", async () => {
    const user = userEvent.setup();
    renderTable({ history: campaignHistory, campaignNames: { 12: "Fall outreach" } });

    const toggle = screen.getByRole("button", {
      name: "Show 3 entries for Fall outreach, August 2026",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(
      "Hide 3 entries for Fall outreach, August 2026",
    );
    expect(screen.getAllByText("SMS messaging")).toHaveLength(2);
    expect(screen.getByText("Voice calling")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Advanced details for SMS messaging/ }),
    ).toHaveLength(2);

    await user.click(toggle);

    expect(screen.queryByText("SMS messaging")).toBeNull();
  });

  test("filters to purchases and credits, or to usage, and back to all (#1322)", async () => {
    const user = userEvent.setup();
    render(<FilterHarness full={campaignHistory} />);
    const bar = screen.getByRole("group", { name: "Filter activity" });
    expect(within(bar).getByRole("button", { name: "All activity", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
    expect(screen.getByText("Phone number rental")).toBeInTheDocument();

    await user.click(within(bar).getByRole("button", { name: "Purchases and credits" }));
    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
    expect(screen.queryByText("Phone number rental")).toBeNull();
    expect(screen.queryByText(/Fall drive/)).toBeNull();

    await user.click(within(bar).getByRole("button", { name: "Usage" }));
    expect(screen.queryByText("Credit purchase")).toBeNull();
    expect(screen.getByText("Phone number rental")).toBeInTheDocument();

    await user.click(within(bar).getByRole("button", { name: "All activity" }));
    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
  });

  test("an empty filtered view says what is missing", async () => {
    const user = userEvent.setup();
    render(<FilterHarness full={history} />);
    await user.click(screen.getByRole("button", { name: "Usage" }));
    expect(screen.getByText("No usage yet.")).toBeInTheDocument();
  });

  test("links Stripe purchases to their hosted receipt when a workspace id is given (#1322)", () => {
    renderTable({ history: campaignHistory, workspaceId: "ws-1" });
    const link = screen.getByRole("link", { name: /^Receipt/ });
    expect(link).toHaveAttribute("href", "/api/workspaces/ws-1/billing/receipt?transaction=purchase-1");
    expect(link).toHaveAttribute("target", "_blank");
    // Usage rows have no receipt.
    expect(screen.getAllByRole("link", { name: /^Receipt/ })).toHaveLength(1);
  });

  test("shows no receipt link without a workspace id", () => {
    renderTable();
    expect(screen.queryByRole("link", { name: /^Receipt/ })).toBeNull();
  });

  test("names an untitled campaign by its id", () => {
    renderTable({ history: campaignHistory });

    expect(screen.getByText("Campaign 12")).toBeInTheDocument();
  });

  test("renders a pager when total pages exceed one", () => {
    renderTable({
      history: campaignHistory,
      currentPage: 1,
      totalPages: 3,
      totalCount: 1_234,
      pageSize: 500,
      onPageChange: () => undefined,
    });

    expect(screen.getByRole("button", { name: "Go to page 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeInTheDocument();
  });

  test("hides the pager when there is a single page", () => {
    renderTable({ currentPage: 1, totalPages: 1, totalCount: 10, pageSize: 500 });

    expect(screen.queryByRole("button", { name: /Go to next/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Go to previous/ })).toBeNull();
  });
});