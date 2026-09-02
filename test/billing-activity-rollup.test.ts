import { describe, expect, test } from "vitest";

import type { BillingActivityRow } from "../app/lib/billing-activity-projection";
import {
  campaignDisplayName,
  localMonthPeriod,
  rollUpBillingActivity,
  type BillingActivityGroupItem,
} from "../app/lib/billing-activity-rollup";

let nextId = 1;

function row(
  overrides: Partial<BillingActivityRow> & Pick<BillingActivityRow, "created_at">,
): BillingActivityRow {
  const id = String(nextId++);
  return {
    id,
    type: "DEBIT",
    amount: -1,
    note: null,
    idempotency_key: `sms:SM${id}`,
    campaign_id: 12,
    ...overrides,
  };
}

// Mid-month, midday UTC: the local calendar month is the same in every
// timezone vitest might run under, so period keys are deterministic.
const AUG = (day: number, hour = 12) =>
  `2026-08-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const JUL = (day: number) => `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`;

function groups(items: ReturnType<typeof rollUpBillingActivity>) {
  return items.filter((item): item is BillingActivityGroupItem => item.kind === "group");
}

describe("rollUpBillingActivity", () => {
  test("groups usage debits that share a campaign and a month", () => {
    const items = rollUpBillingActivity(
      [
        row({ created_at: AUG(20), amount: -1 }),
        row({ created_at: AUG(18), amount: -2, idempotency_key: "call:CA9" }),
        row({ created_at: AUG(3), amount: -1 }),
      ],
      { campaignNames: { 12: "Fall outreach" } },
    );

    expect(items).toHaveLength(1);
    const [group] = groups(items);
    expect(group).toMatchObject({
      kind: "group",
      campaignId: 12,
      campaignName: "Fall outreach",
      periodKey: "2026-08",
      periodLabel: "August 2026",
      firstAt: AUG(3),
      lastAt: AUG(20),
      entryCount: 3,
      totalAmount: -4,
      activities: ["SMS messaging", "Voice calling"],
    });
    expect(group.entries.map((entry) => entry.created_at)).toEqual([
      AUG(20),
      AUG(18),
      AUG(3),
    ]);
  });

  test("keeps different campaigns and different months apart", () => {
    const items = rollUpBillingActivity([
      row({ created_at: AUG(10), campaign_id: 12 }),
      row({ created_at: AUG(11), campaign_id: 12 }),
      row({ created_at: AUG(12), campaign_id: 13 }),
      row({ created_at: AUG(13), campaign_id: 13 }),
      row({ created_at: JUL(12), campaign_id: 12 }),
      row({ created_at: JUL(13), campaign_id: 12 }),
    ]);

    expect(groups(items).map((group) => group.key)).toEqual([
      "campaign:13:2026-08",
      "campaign:12:2026-08",
      "campaign:12:2026-07",
    ]);
    expect(items.every((item) => item.kind === "group")).toBe(true);
  });

  test("never groups purchases, rentals, credits, or campaign-less debits", () => {
    const rows: BillingActivityRow[] = [
      row({
        created_at: AUG(1),
        type: "CREDIT",
        amount: 500,
        idempotency_key: "stripe_session:cs_1",
        campaign_id: null,
      }),
      row({
        created_at: AUG(2),
        type: "CREDIT",
        amount: 500,
        idempotency_key: "stripe_session:cs_2",
        campaign_id: null,
      }),
      row({ created_at: AUG(3), amount: -100, idempotency_key: "number_rent:1:2026-08" }),
      row({ created_at: AUG(4), amount: -100, idempotency_key: "number_rent:2:2026-08" }),
      row({ created_at: AUG(5), campaign_id: null }),
      row({ created_at: AUG(6), campaign_id: null }),
      row({ created_at: AUG(7), idempotency_key: null }),
      row({ created_at: AUG(8), idempotency_key: null }),
    ];

    const items = rollUpBillingActivity(rows);

    expect(groups(items)).toHaveLength(0);
    expect(items).toHaveLength(rows.length);
  });

  test("shows a lone campaign entry as a plain entry, not a group of one", () => {
    const only = row({ created_at: AUG(9) });
    const items = rollUpBillingActivity([only]);

    expect(items).toEqual([{ kind: "entry", row: only }]);
  });

  test("orders groups and entries together by their latest activity", () => {
    const purchase = row({
      created_at: AUG(15),
      type: "CREDIT",
      amount: 500,
      idempotency_key: "stripe_evt:evt_1",
      campaign_id: null,
    });
    const rental = row({
      created_at: AUG(1),
      amount: -100,
      idempotency_key: "number_rent_purchase:w:PN1",
      campaign_id: null,
    });
    const items = rollUpBillingActivity([
      row({ created_at: AUG(12) }),
      rental,
      purchase,
      row({ created_at: AUG(14) }),
    ]);

    expect(items.map((item) => (item.kind === "group" ? "group" : item.row.id))).toEqual([
      purchase.id,
      "group",
      rental.id,
    ]);
  });

  test("falls back to a numbered campaign name when the title is unknown", () => {
    expect(campaignDisplayName(7, undefined)).toBe("Campaign 7");
    expect(campaignDisplayName(7, { 7: "   " })).toBe("Campaign 7");
    expect(campaignDisplayName(7, { 7: "Voter reminder" })).toBe("Voter reminder");
  });

  test("localMonthPeriod tolerates an unparseable timestamp", () => {
    expect(localMonthPeriod("not a date")).toEqual({
      key: "unknown",
      label: "Unknown period",
    });
  });
});
