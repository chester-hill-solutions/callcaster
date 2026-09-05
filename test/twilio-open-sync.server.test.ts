import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callsList: vi.fn(async () => [] as unknown[]),
  callFetch: vi.fn(),
  messagesList: vi.fn(async () => [] as unknown[]),
  messageFetch: vi.fn(),
  callFindMany: vi.fn(async () => [] as unknown[]),
  messageFindMany: vi.fn(async () => [] as unknown[]),
  processCallStatusWebhook: vi.fn(async () => ({
    call: {},
    billingResult: { inserted: true },
  })),
  updateMessageBySid: vi.fn(async () => ({})),
  enqueueJob: vi.fn(async () => ({ enqueued: true })),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: vi.fn(async () => ({
    calls: Object.assign((sid: string) => ({ fetch: () => mocks.callFetch(sid) }), {
      list: (...args: unknown[]) => mocks.callsList(...args),
    }),
    messages: Object.assign(
      (sid: string) => ({ fetch: () => mocks.messageFetch(sid) }),
      { list: (...args: unknown[]) => mocks.messagesList(...args) },
    ),
  })),
}));

vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => ({
    call: { findMany: (...args: unknown[]) => mocks.callFindMany(...args) },
    message: { findMany: (...args: unknown[]) => mocks.messageFindMany(...args) },
  })),
}));

vi.mock("@/lib/twilio-call-status.server", () => ({
  processCallStatusWebhook: (...args: unknown[]) =>
    mocks.processCallStatusWebhook(...args),
}));
vi.mock("@/lib/message-db.server", () => ({
  updateMessageBySid: (...args: unknown[]) => mocks.updateMessageBySid(...args),
}));
vi.mock("@/lib/worker/enqueue-job.server", () => ({
  unsafeEnqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

import { triggerTwilioOpenSync } from "@/lib/twilio-open-sync.server";

describe("triggerTwilioOpenSync terminal recovery (TEL-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callsList.mockResolvedValue([]);
    mocks.messagesList.mockResolvedValue([]);
    mocks.callFindMany.mockResolvedValue([]);
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.processCallStatusWebhook.mockResolvedValue({
      call: {},
      billingResult: { inserted: true },
    });
  });

  test("routes a locally-open, provider-terminal call through the canonical billing processor", async () => {
    mocks.callFindMany.mockResolvedValue([
      { sid: "CA1", status: "in-progress", date_created: "2026-07-29T00:00:00Z" },
    ]);
    mocks.callsList.mockResolvedValue([
      {
        sid: "CA1",
        status: "completed",
        duration: 63,
        endTime: new Date("2026-07-29T00:02:00Z"),
        dateUpdated: new Date("2026-07-29T00:02:01Z"),
      },
    ]);

    const result = await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(result.ok).toBe(true);
    expect(mocks.processCallStatusWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA1", status: "completed", duration: "63" }),
      expect.objectContaining({ workspaceId: "ws-1" }),
    );
  });

  test("falls back to a per-SID fetch when the call is outside the list window", async () => {
    mocks.callFindMany.mockResolvedValue([
      { sid: "CA2", status: "queued", date_created: "2026-07-29T00:00:00Z" },
    ]);
    mocks.callsList.mockResolvedValue([]);
    mocks.callFetch.mockResolvedValue({
      sid: "CA2",
      status: "no-answer",
      duration: 0,
    });

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.callFetch).toHaveBeenCalledWith("CA2");
    expect(mocks.processCallStatusWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA2", status: "no-answer" }),
      expect.anything(),
    );
  });

  // #1289: rows stuck longer than maxAgeMinutes must still be swept, and a
  // Twilio 404 on an old row is an answer (terminalize), not a retry.
  test("sweeps open rows older than the window (no date_created lower bound)", async () => {
    mocks.callFindMany.mockResolvedValue([]);
    await triggerTwilioOpenSync({ workspaceId: "ws-1", maxAgeMinutes: 120 });

    const where = mocks.callFindMany.mock.calls[0]?.[0]?.where;
    // Selection must not filter on date_created — the old shape wrapped the
    // status filter in and(status, gte(date_created, since)), which let a row
    // stuck >2h escape the sweep forever. Drizzle where objects are circular,
    // so walk them collecting referenced column names instead of serializing.
    const columns = new Set<string>();
    const seen = new Set<object>();
    const walk = (node: unknown) => {
      if (node == null || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const name = (node as { name?: unknown }).name;
      const table = (node as { table?: unknown }).table;
      if (typeof name === "string" && table != null) {
        // A column reference: record it, but do NOT recurse into its .table —
        // that would enumerate every column of the table and defeat the check.
        columns.add(name);
        return;
      }
      for (const value of Object.values(node)) walk(value);
    };
    walk(where);
    expect([...columns]).toContain("status");
    expect([...columns]).not.toContain("date_created");
  });

  test("terminalizes an old Twilio-404 call as failed through the canonical processor", async () => {
    mocks.callFindMany.mockResolvedValue([
      // Far older than any window.
      { sid: "CA404", status: "queued", date_created: "2026-07-01T00:00:00Z", is_last: false },
    ]);
    mocks.callsList.mockResolvedValue([]);
    mocks.callFetch.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404, code: 20404 }),
    );

    const result = await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(result.ok).toBe(true);
    expect(mocks.processCallStatusWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ sid: "CA404", status: "failed" }),
      expect.objectContaining({ workspaceId: "ws-1" }),
    );
  });

  test("a young Twilio-404 call is skipped, not terminalized", async () => {
    mocks.callFindMany.mockResolvedValue([
      { sid: "CAyoung", status: "queued", date_created: new Date().toISOString(), is_last: false },
    ]);
    mocks.callsList.mockResolvedValue([]);
    mocks.callFetch.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404, code: 20404 }),
    );

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.processCallStatusWebhook).not.toHaveBeenCalled();
  });

  test("a transient fetch failure on an old row skips (retries next run) rather than terminalizing", async () => {
    mocks.callFindMany.mockResolvedValue([
      { sid: "CAflaky", status: "queued", date_created: "2026-07-01T00:00:00Z", is_last: false },
    ]);
    mocks.callsList.mockResolvedValue([]);
    mocks.callFetch.mockRejectedValue(
      Object.assign(new Error("service unavailable"), { status: 503 }),
    );

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.processCallStatusWebhook).not.toHaveBeenCalled();
  });

  test("a Twilio-404 message is never terminalized (billing side-effects risk)", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { sid: "SM404", status: "queued", date_created: "2026-07-01T00:00:00Z", date_updated: null },
    ]);
    mocks.messagesList.mockResolvedValue([]);
    mocks.messageFetch.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404, code: 20404 }),
    );

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("terminal message discovery updates the row and enqueues the billing side-effects job", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { sid: "SM1", status: "sending", date_created: "2026-07-29T00:00:00Z", date_updated: null },
    ]);
    mocks.messagesList.mockResolvedValue([
      { sid: "SM1", status: "delivered", errorCode: null, dateUpdated: new Date() },
    ]);

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
      "ws-1",
      "SM1",
      expect.objectContaining({ status: "delivered" }),
    );
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sms_status_side_effects",
        idempotencyKey: "sms_status_side_effects:SM1:delivered",
        params: expect.objectContaining({ sid: "SM1" }),
      }),
    );
  });

  test("a failed side-effects enqueue leaves the message open so the next sweep retries the debit", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { sid: "SM_lost", status: "sent", date_created: "2026-05-01T00:00:00.000Z", date_updated: null },
    ]);
    mocks.messagesList.mockResolvedValue([
      { sid: "SM_lost", status: "delivered", errorCode: null, dateUpdated: new Date("2026-05-01T00:05:00.000Z") },
    ]);
    mocks.enqueueJob.mockRejectedValueOnce(new Error("lock timeout"));

    const result = await triggerTwilioOpenSync({ workspaceId: "ws_1" });

    expect(result.ok).toBe(false);
    expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
  });

  test("queues the billing job before writing the terminal status", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { sid: "SM_order", status: "sent", date_created: "2026-05-01T00:00:00.000Z", date_updated: null },
    ]);
    mocks.messagesList.mockResolvedValue([
      { sid: "SM_order", status: "delivered", errorCode: null, dateUpdated: new Date("2026-05-01T00:05:00.000Z") },
    ]);

    await triggerTwilioOpenSync({ workspaceId: "ws_1" });

    const enqueueOrder = mocks.enqueueJob.mock.invocationCallOrder[0];
    const updateOrder = mocks.updateMessageBySid.mock.invocationCallOrder[0];
    expect(enqueueOrder).toBeDefined();
    expect(updateOrder).toBeDefined();
    expect(enqueueOrder).toBeLessThan(updateOrder as number);
  });

  test("non-terminal message drift updates the row but does not enqueue billing", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { sid: "SM2", status: "queued", date_created: "2026-07-29T00:00:00Z", date_updated: null },
    ]);
    mocks.messagesList.mockResolvedValue([
      { sid: "SM2", status: "sending", errorCode: null, dateUpdated: new Date() },
    ]);

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.updateMessageBySid).toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  test("unchanged statuses touch nothing", async () => {
    mocks.callFindMany.mockResolvedValue([
      { sid: "CA3", status: "in-progress", date_created: "2026-07-29T00:00:00Z" },
    ]);
    mocks.callsList.mockResolvedValue([{ sid: "CA3", status: "in-progress" }]);

    await triggerTwilioOpenSync({ workspaceId: "ws-1" });

    expect(mocks.processCallStatusWebhook).not.toHaveBeenCalled();
  });
});
