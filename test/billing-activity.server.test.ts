import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  attributeLedgerCampaigns,
  type LedgerActivityRow,
} from "../app/lib/billing-activity.server";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  getWorkspaceCreditsBalance: vi.fn(async (): Promise<number | null> => 250),
  ledgerFindMany: vi.fn(async (): Promise<LedgerActivityRow[]> => []),
  execute: vi.fn(async (): Promise<unknown[]> => []),
  messageFindMany: vi.fn(async (): Promise<unknown[]> => []),
  callFindMany: vi.fn(async (): Promise<unknown[]> => []),
  campaignFindMany: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));

vi.mock("@/lib/workspace-credits.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-credits.server")>()),
  getWorkspaceCreditsBalance: (...args: unknown[]) =>
    mocks.getWorkspaceCreditsBalance(...args),
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({
    transaction_history: {
      findMany: mocks.ledgerFindMany,
    },
    message: { findMany: mocks.messageFindMany },
    call: { findMany: mocks.callFindMany },
    campaign: { findMany: mocks.campaignFindMany },
    execute: mocks.execute,
  })),
}));

function ledgerRow(overrides: Partial<LedgerActivityRow>): LedgerActivityRow {
  return {
    id: 1,
    created_at: "2026-08-10T12:00:00.000Z",
    type: "DEBIT",
    amount: -1,
    note: null,
    idempotency_key: "sms:SM1",
    campaign_id: null,
    message_sid: null,
    call_sid: null,
    ...overrides,
  };
}

describe("attributeLedgerCampaigns", () => {
  test("keeps a recorded campaign id and resolves missing ones through SIDs", () => {
    const rows = attributeLedgerCampaigns(
      [
        ledgerRow({ id: 1, campaign_id: 3, message_sid: "SM1" }),
        ledgerRow({ id: 2, message_sid: "SM2" }),
        ledgerRow({ id: 3, idempotency_key: "call:CA1", call_sid: "CA1" }),
        ledgerRow({ id: 4, message_sid: "SM-unknown" }),
        ledgerRow({ id: 5, type: "CREDIT", amount: 500, idempotency_key: "stripe_evt:e" }),
      ],
      {
        messages: new Map([
          ["SM1", 99],
          ["SM2", 7],
        ]),
        calls: new Map([["CA1", 8]]),
      },
    );

    expect(rows.map((row) => [row.id, row.type, row.campaign_id])).toEqual([
      ["1", "DEBIT", 3],
      ["2", "DEBIT", 7],
      ["3", "DEBIT", 8],
      ["4", "DEBIT", null],
      ["5", "CREDIT", null],
    ]);
  });
});

describe("getWorkspaceBillingActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(250);
    mocks.ledgerFindMany.mockResolvedValue([]);
    mocks.execute.mockResolvedValue([]);
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.callFindMany.mockResolvedValue([]);
    mocks.campaignFindMany.mockResolvedValue([]);
  });

  test("returns attributed history and the titles of referenced campaigns", async () => {
    mocks.ledgerFindMany.mockResolvedValue([
      ledgerRow({ id: 1, campaign_id: 3, message_sid: "SM1" }),
      ledgerRow({ id: 2, message_sid: "SM2" }),
      ledgerRow({ id: 3, idempotency_key: "call:CA1", call_sid: "CA1" }),
    ]);
    mocks.messageFindMany.mockResolvedValue([{ sid: "SM2", campaign_id: 7 }]);
    mocks.callFindMany.mockResolvedValue([{ sid: "CA1", campaign_id: 3 }]);
    mocks.campaignFindMany.mockResolvedValue([
      { id: 3, title: "Fall outreach" },
      { id: 7, title: "Reminder" },
    ]);

    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );
    const result = await getWorkspaceBillingActivity("u1", "w1");

    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({
      user: { id: "u1" },
      workspaceId: "w1",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.balance).toBe(250);
    // Campaign 3's two usage debits roll into one group; campaign 7's lone
    // debit (attributed via message SID) stays an entry.
    const group = result.items.find((item) => item.kind === "group");
    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") throw new Error("expected a group");
    expect(group.campaignName).toBe("Fall outreach");
    expect(group.entryCount).toBe(2);
    expect(group.totalAmount).toBe(-2);
    const entry = result.items.find((item) => item.kind === "entry");
    expect(entry?.kind).toBe("entry");
    if (entry?.kind !== "entry") throw new Error("expected an entry");
    expect(entry.row.campaign_id).toBe(7);
    expect(mocks.messageFindMany).toHaveBeenCalledOnce();
    expect(mocks.callFindMany).toHaveBeenCalledOnce();
  });

  test("keeps a campaign whole — a campaign spanning many rows is one group", async () => {
    // 60 SMS debits for one campaign in the same month: a legacy 500-row page
    // cap would have split these across pages; the pre-rollup must not.
    const rows = Array.from({ length: 60 }, (_, i) =>
      ledgerRow({
        id: i + 1,
        campaign_id: 12,
        message_sid: `SM${i + 1}`,
        created_at: "2026-08-10T12:00:00.000Z",
        idempotency_key: `sms:SM${i + 1}`,
      }),
    );
    mocks.ledgerFindMany.mockResolvedValue(rows);
    mocks.campaignFindMany.mockResolvedValue([{ id: 12, title: "Reminder" }]);

    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );
    const result = await getWorkspaceBillingActivity("u1", "w1");

    if (!result.ok) throw new Error("expected ok");
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.kind).toBe("group");
    if (item.kind !== "group") throw new Error("expected a group");
    expect(item.entryCount).toBe(60);
    expect(item.totalAmount).toBe(-60);
    expect(result.totalCount).toBe(1);
  });

  test("skips SID and campaign lookups when nothing needs attributing", async () => {
    mocks.ledgerFindMany.mockResolvedValue([
      ledgerRow({ id: 1, type: "CREDIT", amount: 500, idempotency_key: "stripe_evt:e" }),
    ]);

    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );
    const result = await getWorkspaceBillingActivity("u1", "w1");

    expect(result.ok).toBe(true);
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.callFindMany).not.toHaveBeenCalled();
    expect(mocks.campaignFindMany).not.toHaveBeenCalled();
  });

  test("reports a missing workspace", async () => {
    mocks.getWorkspaceCreditsBalance.mockResolvedValue(null);

    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );

    await expect(getWorkspaceBillingActivity("u1", "w-missing")).resolves.toEqual({
      ok: false,
      error: "Workspace not found",
      status: 404,
    });
    expect(mocks.ledgerFindMany).not.toHaveBeenCalled();
  });

  test("pages the rolled-up items and reports the total item count", async () => {
    // 60 lone-entry credits (no campaign) across two months, so the rollup
    // emits 60 entries (no groups) and slicing applies to the items.
    const rows = Array.from({ length: 60 }, (_, i) =>
      ledgerRow({
        id: i + 1,
        type: "CREDIT",
        amount: 500,
        campaign_id: null,
        message_sid: null,
        idempotency_key: `stripe_evt:e${i + 1}`,
      }),
    );
    mocks.ledgerFindMany.mockResolvedValue(rows);

    const { getWorkspaceBillingActivity, BILLING_ACTIVITY_ITEM_PAGE_SIZE } =
      await import("../app/lib/billing-activity.server");
    const page2 = await getWorkspaceBillingActivity("u1", "w1", { page: 2 });
    const page1 = await getWorkspaceBillingActivity("u1", "w1", { page: 1 });

    if (!page1.ok || !page2.ok) throw new Error("expected ok");
    expect(page2.page).toBe(2);
    expect(page2.pageSize).toBe(BILLING_ACTIVITY_ITEM_PAGE_SIZE);
    expect(page2.totalCount).toBe(60);
    expect(page1.items).toHaveLength(BILLING_ACTIVITY_ITEM_PAGE_SIZE);
    expect(page2.items).toHaveLength(10);
  });

  test("clamps page to 1 for missing, zero, and negative values", async () => {
    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );

    for (const page of [undefined, 0, -3, 1]) {
      const result = await getWorkspaceBillingActivity("u1", "w1", { page });
      if (!result.ok) throw new Error("expected ok");
      expect(result.page).toBe(1);
    }
  });

  test("passes the activity filter into the ledger query", async () => {
    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );

    await getWorkspaceBillingActivity("u1", "w1", { page: 1, filter: "purchases" });

    const config = mocks.ledgerFindMany.mock.calls[0][0];
    expect(config.where).toBeDefined();
    // No limit/offset: the full filtered ledger is fetched so the rollup can
    // keep campaigns whole before item pagination slices them.
    expect(config.limit).toBeUndefined();
    expect(config.offset).toBeUndefined();
  });

  test("reports full-ledger usage and purchase totals", async () => {
    mocks.execute.mockResolvedValue([
      { usage: "-3798", purchased: "4600" },
    ]);

    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );
    const result = await getWorkspaceBillingActivity("u1", "w1");

    if (!result.ok) throw new Error("expected ok");
    expect(result.totals).toEqual({ usage: 3798, purchased: 4600 });
  });

  test("defaults totals to zero when the ledger summary returns no row", async () => {
    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );

    const result = await getWorkspaceBillingActivity("u1", "w1");

    if (!result.ok) throw new Error("expected ok");
    expect(result.totals).toEqual({ usage: 0, purchased: 0 });
  });
});
