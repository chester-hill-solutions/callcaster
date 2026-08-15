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
