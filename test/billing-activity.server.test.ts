import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  attributeLedgerCampaigns,
  type LedgerActivityRow,
} from "../app/lib/billing-activity.server";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  getWorkspaceCreditsBalance: vi.fn(async (): Promise<number | null> => 250),
  ledgerFindMany: vi.fn(async (): Promise<LedgerActivityRow[]> => []),
  ledgerCount: vi.fn(async (): Promise<number> => 0),
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
      count: mocks.ledgerCount,
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
    mocks.ledgerCount.mockResolvedValue(0);
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
    expect(result).toMatchObject({
      ok: true,
      balance: 250,
      campaignNames: { 3: "Fall outreach", 7: "Reminder" },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.history.map((row) => row.campaign_id)).toEqual([3, 7, 3]);
    expect(mocks.messageFindMany).toHaveBeenCalledOnce();
    expect(mocks.callFindMany).toHaveBeenCalledOnce();
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

  test("pages the ledger with offset and returns the total count", async () => {
    mocks.ledgerCount.mockResolvedValue(1_234);

    const { getWorkspaceBillingActivity, BILLING_ACTIVITY_LIMIT } = await import(
      "../app/lib/billing-activity.server"
    );
    const result = await getWorkspaceBillingActivity("u1", "w1", { page: 2 });

    const config = mocks.ledgerFindMany.mock.calls[0][0];
    expect(config.limit).toBe(BILLING_ACTIVITY_LIMIT);
    expect(config.offset).toBe(BILLING_ACTIVITY_LIMIT);
    expect(config.where).toBeUndefined();
    expect(mocks.ledgerCount).toHaveBeenCalledWith({ where: undefined });
    if (!result.ok) throw new Error("expected ok");
    expect(result).toMatchObject({
      page: 2,
      pageSize: BILLING_ACTIVITY_LIMIT,
      totalCount: 1_234,
    });
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

    for (const config of mocks.ledgerFindMany.mock.calls) {
      expect(config[0].offset).toBe(0);
    }
  });

  test("passes the activity filter into the ledger query and count", async () => {
    const { getWorkspaceBillingActivity } = await import(
      "../app/lib/billing-activity.server"
    );

    await getWorkspaceBillingActivity("u1", "w1", { page: 1, filter: "purchases" });

    const config = mocks.ledgerFindMany.mock.calls[0][0];
    expect(config.where).toBeDefined();
    expect(mocks.ledgerCount).toHaveBeenCalledWith({
      where: expect.anything(),
    });
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
