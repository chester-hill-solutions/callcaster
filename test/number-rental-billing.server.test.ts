import { beforeEach, describe, expect, test, vi } from "vitest";

const tdbMocks = vi.hoisted(() => ({
  workspace_number: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  transaction_history: {
    findFirst: vi.fn(),
  },
}));

const transactionHistoryMocks = vi.hoisted(() => ({
  insertTransactionHistoryIdempotent: vi.fn(),
}));

const opsMocks = vi.hoisted(() => ({ notifyOps: vi.fn() }));
const lifecycleMocks = vi.hoisted(() => ({ removeWorkspacePhoneNumber: vi.fn() }));
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

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(),
  removeWorkspacePhoneNumber: (...a: unknown[]) => lifecycleMocks.removeWorkspacePhoneNumber(...a),
}));

vi.mock("@/lib/transaction-history.server", () => transactionHistoryMocks);

vi.mock("@/lib/workspace-credits.server", () => creditsMocks);
vi.mock("@/lib/ops-alert.server", () => ({ notifyOps: (...a: unknown[]) => opsMocks.notifyOps(...a) }));

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
    twilio_phone_number_sid: "PN123",
    suspended_at: null,
    phone_number: "+15551234567",
    friendly_name: null,
    created_at: "2026-04-01",
    ...overrides,
  };
}

describe("runNumberRentalBilling", () => {
  beforeEach(() => {
    tdbMocks.workspace_number.findMany.mockReset();
    tdbMocks.transaction_history.findFirst.mockReset();
    // Default: this cycle has not been billed yet.
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
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
      // The April (creation) cycle was already billed; only the reminder for
      // the upcoming May cycle should fire.
      tdbMocks.transaction_history.findFirst.mockResolvedValue({ id: 7 });

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
        autoReleaseImplemented: true,
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
    // The April (creation) month is charged at purchase, not by the sweep, so
    // the only cycle in scope is the May renewal — and it is unbilled.
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
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
      autoReleaseImplemented: true,
    });
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "DEBIT",
        note: expect.stringContaining("2026-05"),
      }),
    );
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  /**
   * The purchase flow debits the first month under `number_rent_purchase:*`,
   * the sweep under `number_rent:*`. The already-billed probe only looks up the
   * cycle key, so it cannot see the purchase debit — including the creation
   * month here charged that month twice, on the very day the number was bought.
   *
   * The second assertion is the important half: pushing the boundary one month
   * the other way would skip a month permanently, and because every charge is
   * idempotency-keyed nothing would error, retry, or alarm.
   */
  test("does not re-charge the creation month, and still bills the next one", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-15" }),
    ]);
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue(undefined);

    // Same day the number was bought: the purchase debit is the only charge.
    const onPurchaseDay = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-04-15T00:00:00.000Z"),
    });
    expect(onPurchaseDay).toMatchObject({ charged: 0, unpaid: 0 });
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).not.toHaveBeenCalled();

    // One month later the renewal is due and must be charged exactly once.
    const atRenewal = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-15T00:00:00.000Z"),
    });
    expect(atRenewal).toMatchObject({ charged: 1 });
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledTimes(1);
    expect(transactionHistoryMocks.insertTransactionHistoryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ note: expect.stringContaining("2026-05") }),
    );
  });

  test("catches up cycles missed while the worker was down (BILL-02)", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-10" }),
    ]);
    // Neither the May nor June renewal was ever billed; the sweep runs late.
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue(undefined);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ charged: 2, unpaid: 0 });
    const notes = transactionHistoryMocks.insertTransactionHistoryIdempotent.mock.calls.map(
      ([args]) => (args as { note: string }).note,
    );
    expect(notes).toEqual([
      expect.stringContaining("2026-05"),
      expect.stringContaining("2026-06"),
    ]);
  });

  test("stops catch-up for a number once a cycle is unaffordable", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-10" }),
    ]);
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(40);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-12T00:00:00.000Z"),
    });

    // Two cycles are owed, but only one unpaid is recorded — later cycles are
    // skipped rather than spamming the log for the same broke workspace.
    expect(result).toMatchObject({ charged: 0, unpaid: 1 });
    expect(
      transactionHistoryMocks.insertTransactionHistoryIdempotent,
    ).not.toHaveBeenCalled();
  });

  /**
   * An unpaid rental is an ongoing cost we absorb while the customer is not
   * charged, and it used to be announced only by an `info` log — the count goes
   * into `job.result`, which nothing reads. Auto-release is deliberately not
   * implemented (releasing a number at Twilio is irreversible), so the alert is
   * the entire signal that anything is wrong.
   */
  test("alerts ops when a rental goes unpaid", async () => {
    opsMocks.notifyOps.mockClear();
    // One elapsed renewal cycle: rented in May, unpaid at the June renewal.
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-05-01" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(40);

    await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    // One alert, from the ladder, naming the number and the rung reached — a
    // separate aggregate alert would report the same fact less usefully.
    expect(opsMocks.notifyOps).toHaveBeenCalledTimes(1);
    expect(opsMocks.notifyOps.mock.calls[0]![0]).toMatchObject({
      event: "billing.rental_unpaid_warned",
      context: expect.objectContaining({ unpaidCycles: 1, numberId: 1 }),
    });
  });

  /**
   * Ladder: 1 unpaid cycle warns, 2 suspends, 3 releases. Release is
   * irreversible at Twilio, so these assert the rung reached — not merely that
   * "something happened".
   */
  test("two unpaid cycles suspends the number rather than releasing it", async () => {
    opsMocks.notifyOps.mockClear();
    lifecycleMocks.removeWorkspacePhoneNumber.mockClear();
    tdbMocks.workspace_number.update.mockResolvedValue([{ id: 1 }]);
    // Two elapsed renewal cycles with no ledger rows (2026-05-01, 2026-06-01).
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ suspended: 1, released: 0 });
    expect(tdbMocks.workspace_number.update).toHaveBeenCalledTimes(1);
    expect(lifecycleMocks.removeWorkspacePhoneNumber).not.toHaveBeenCalled();
  });

  test("three unpaid cycles releases the number at Twilio", async () => {
    opsMocks.notifyOps.mockClear();
    // The real function never throws — it returns { error }.
    lifecycleMocks.removeWorkspacePhoneNumber.mockClear().mockResolvedValue({ error: null });
    // Three elapsed renewal cycles: 2026-04-01, 2026-05-01, 2026-06-01.
    // Already suspended, so release is the correct next rung.
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-03-01", suspended_at: "2026-05-02T00:00:00.000Z" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ released: 1 });
    expect(lifecycleMocks.removeWorkspacePhoneNumber).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", numberId: BigInt(1) }),
    );
    expect(opsMocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ event: "billing.rental_released", severity: "page" }),
    );
  });

  test("a number with no Twilio SID is never released", async () => {
    lifecycleMocks.removeWorkspacePhoneNumber.mockClear();
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-03-01", twilio_phone_number_sid: null }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    // Nothing to release at the provider, and deleting the row would erase a
    // number the customer may still believe they own.
    expect(result).toMatchObject({ released: 0 });
    expect(lifecycleMocks.removeWorkspacePhoneNumber).not.toHaveBeenCalled();
  });

  test("an already-suspended number is not suspended or emailed again", async () => {
    tdbMocks.workspace_number.update.mockClear();
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01", suspended_at: "2026-04-02T00:00:00.000Z" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ suspended: 0 });
    // Specifically no SUSPENSION write. `update` is no longer a proxy for
    // "nothing happened" — the warn rung writes a rental_warned_cycle marker,
    // which is what stops it emailing daily.
    expect(tdbMocks.workspace_number.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ suspended_at: expect.anything() }),
      }),
    );
  });

  test("does not alert when every rental is paid", async () => {
    opsMocks.notifyOps.mockClear();
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(5_000);

    await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(opsMocks.notifyOps).not.toHaveBeenCalled();
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

  test("re-run of an already-billed cycle is a no-op, not a false unpaid, even when the balance is now low", async () => {
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01" }),
    ]);
    // This cycle was already charged on an earlier at-least-once cron run…
    tdbMocks.transaction_history.findFirst.mockResolvedValue({ id: 42 });
    // …and the balance has since dropped below the rental cost (the charge
    // itself, or other spend). Idempotency must win: no re-charge, no false
    // unpaid.
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(10);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ charged: 0, unpaid: 0 });
    expect(
      transactionHistoryMocks.insertTransactionHistoryIdempotent,
    ).not.toHaveBeenCalled();
  });

  /**
   * `suspended_at` was written in exactly one place and cleared in none, so a
   * customer who paid stayed suspended forever — while the suspension email
   * told them to "add credits to restore it".
   */
  test("paying clears the suspension", async () => {
    tdbMocks.workspace_number.update.mockResolvedValue([{ id: 1 }]);
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-04-01", suspended_at: "2026-05-02T00:00:00.000Z" }),
    ]);
    tdbMocks.transaction_history.findFirst.mockResolvedValue(null);
    transactionHistoryMocks.insertTransactionHistoryIdempotent.mockResolvedValue(undefined);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(10_000);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ charged: 1, unsuspended: 1 });
    expect(tdbMocks.workspace_number.update).toHaveBeenCalledWith(
      expect.objectContaining({ set: { suspended_at: null } }),
    );
  });

  /**
   * Release is the only irreversible rung. A number carrying a backlog of
   * unpaid cycles — the ladder meeting numbers that predate it, or a long
   * worker outage — must not be taken away without the customer ever having
   * been suspended.
   */
  test("a never-suspended number suspends instead of releasing, however far behind", async () => {
    lifecycleMocks.removeWorkspacePhoneNumber.mockClear();
    tdbMocks.workspace_number.update.mockResolvedValue([{ id: 1 }]);
    // Six unpaid renewal cycles, but suspended_at was never set.
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-01-01", suspended_at: null }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ suspended: 1, released: 0 });
    expect(lifecycleMocks.removeWorkspacePhoneNumber).not.toHaveBeenCalled();
  });

  /**
   * removeWorkspacePhoneNumber catches internally and returns `{ error }`.
   * Unchecked, a failed release still told the customer the number was gone
   * for good and paged ops that an irreversible action had completed.
   */
  test("a failed release is not reported as a release", async () => {
    opsMocks.notifyOps.mockClear();
    resendMocks.send.mockClear();
    lifecycleMocks.removeWorkspacePhoneNumber
      .mockClear()
      .mockResolvedValue({ error: new Error("Twilio 20404") });
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-03-01", suspended_at: "2026-05-02T00:00:00.000Z" }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ released: 0 });
    expect(opsMocks.notifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "billing.rental_released" }),
    );
    // And the customer is not told they lost a number they still own.
    expect(resendMocks.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("has been released") }),
    );
  });

  /**
   * The sweep runs daily and the warn rung fires whenever the unpaid count is
   * exactly 1, so without a marker a workspace was emailed "Payment needed"
   * every day for up to a month. The suspend rung was already idempotent; this
   * one was not.
   */
  test("warns once per unpaid-cycle count, not once per daily sweep", async () => {
    tdbMocks.workspace_number.update.mockResolvedValue([{ id: 1 }]);
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-05-01", rental_warned_cycle: 1 }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);
    resendMocks.send.mockClear();

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ warned: 0 });
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  /**
   * Stores the cycle COUNT rather than a boolean so a customer who pays some
   * and falls behind again is warned afresh — a boolean would suppress that
   * second, legitimate warning forever.
   */
  test("warns again when the unpaid count changes", async () => {
    tdbMocks.workspace_number.update.mockResolvedValue([{ id: 1 }]);
    tdbMocks.workspace_number.findMany.mockResolvedValue([
      makeNumber({ created_at: "2026-05-01", rental_warned_cycle: 3 }),
    ]);
    creditsMocks.getWorkspaceCreditsBalance.mockResolvedValue(0);
    resendMocks.send.mockClear();

    const result = await runNumberRentalBilling({
      workspaceId: "workspace-1",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ warned: 1 });
    expect(tdbMocks.workspace_number.update).toHaveBeenCalledWith(
      expect.objectContaining({ set: { rental_warned_cycle: 1 } }),
    );
  });

  test("an empty workspace reports zeroes across the whole ladder", async () => {
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
      suspended: 0,
      unsuspended: 0,
      warned: 0,
      remindersSent: 0,
      remindersFailed: 0,
      autoReleaseImplemented: true,
    });
  });
});
