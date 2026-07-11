import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  workspace_number: {
    findMany: vi.fn(),
  },
}));

const transactionHistoryMocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
}));

const creditsMocks = vi.hoisted(() => ({
  getWorkspaceCreditsBalance: vi.fn(),
}));

const workspaceMembersMocks = vi.hoisted(() => ({
  listWorkspaceOwnerAdminEmails: vi.fn(),
}));

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email_1" }, error: null })),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

vi.mock("@/lib/database.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(),
}));

vi.mock("@/lib/transaction-history.server", () => transactionHistoryMocks);

vi.mock("@/lib/workspace-credits.server", () => creditsMocks);

vi.mock("@/lib/workspace-members-db.server", () => workspaceMembersMocks);

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: unknown[]) => resendMocks.send(...args) };
    constructor(_apiKey: string) {}
  }
  return { Resend };
});

import { runNumberRentalBilling } from "../app/lib/number-rental-billing.server";

/** A rented workspace_number row with the fields the sweep reads. */
function makeNumber(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    workspace: "workspace-1",
    type: "rented",
    phone_number: "+15551234567",
    friendly_name: null,
    created_at: "2026-04-01",
    ...overrides,
  };
}

describe("runNumberRentalBilling", () => {
  beforeEach(() => {
    tdbMocks.workspace_number.findMany.mockReset();
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockReset();
    creditsMocks.getWorkspaceCreditsBalance.mockReset();
    // Default: plenty of credits so existing charge assertions hold.
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(10_000);
    workspaceMembersMocks.listWorkspaceOwnerAdminEmails.mockReset();
    workspaceMembersMocks.listWorkspaceOwnerAdminEmails.mockResolvedValue([
      "owner@example.com",
    ]);
    resendMocks.send.mockReset();
    resendMocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  test("throws if workspaceId is not provided", async () => {
    await expect(runNumberRentalBilling({})).rejects.toThrow(
      "workspaceId is required for number rental billing",
    );
  });

  test.each([
    { anchorDay: "26", daysUntilDue: 25 },
    { anchorDay: "16", daysUntilDue: 15 },
    { anchorDay: "04", daysUntilDue: 3 },
  ])(
    "sends a reminder email $daysUntilDue days before the due date",
    async ({ anchorDay, daysUntilDue }) => {
      tdbMocks.workspace_number.findMany.mockResolvedValue([
        makeNumber({ created_at: `2026-04-${anchorDay}` }),
      ]);

      const result = await runNumberRentalBilling({
        workspaceId: "workspace-1",
        today: new Date("2026-05-01T00:00:00.000Z"),
      });

      expect(result).toMatchObject({
        ok: true,
        processed: 1,
        charged: 0,
        released: 0,
        remindersSent: 1,
        remindersFailed: 0,
        autoReleaseImplemented: false,
      });
      expect(workspaceMembersMocks.listWorkspaceOwnerAdminEmails).toHaveBeenCalledWith(
        "workspace-1",
      );
      expect(resendMocks.send).toHaveBeenCalledTimes(1);
      expect(resendMocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Callcaster <info@callcaster.ca>",
          to: ["owner@example.com"],
          subject: `Your CallCaster number rental renews in ${daysUntilDue} days`,
        }),
      );
    },
  );

  test("does not send a reminder outside the -25/-15/-3 day windows", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-20" }),
    ]);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ remindersSent: 0, remindersFailed: 0 });
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  test("counts a failed reminder in remindersFailed, not remindersSent, when there are no recipients", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-26" }),
    ]);
    workspaceMembersMocks.listWorkspaceOwnerAdminEmails.mockResolvedValue([]);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ remindersSent: 0, remindersFailed: 1 });
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  test("counts a failed reminder in remindersFailed, not remindersSent, when Resend throws", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-26" }),
    ]);
    resendMocks.send.mockRejectedValue(new Error("resend down"));

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ remindersSent: 0, remindersFailed: 1 });
  });

  test("charges the workspace on the due date and does not send a reminder that day", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01" }),
    ]);
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue(undefined);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      charged: 1,
      remindersSent: 0,
      remindersFailed: 0,
      released: 0,
      autoReleaseImplemented: false,
    });
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "DEBIT",
      }),
    );
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  test("leaves the rental unpaid (no debit) when the workspace can't afford it", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01" }),
    ]);
    // Below the 100-credit monthly rental — must not charge into a negative balance.
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(40);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ charged: 0, unpaid: 1 });
    expect(
      transactionHistoryMocks.insertTransactionHistoryIdempotent,
    ).not.toHaveBeenCalled();
  });

  test("result shape is always honest about auto-release: released is 0 and autoReleaseImplemented is false", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([]);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      processed: 0,
      charged: 0,
      unpaid: 0,
      released: 0,
      remindersSent: 0,
      remindersFailed: 0,
      autoReleaseImplemented: false,
    });
  });
});
