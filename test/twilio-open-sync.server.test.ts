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
  resolveMessageByClientRef: vi.fn(async () => ({})),
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
  resolveMessageByClientRef: (...args: unknown[]) => mocks.resolveMessageByClientRef(...args),
  isPendingMessageSid: (sid: unknown) => String(sid).startsWith("pending:"),
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
    mocks.messageFindMany.mockResolvedValueOnce([
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
    mocks.messageFindMany.mockResolvedValueOnce([
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

  describe("provider send time (#2049)", () => {
    // Twilio does NOT put a send timestamp in the status callback — the
    // documented callback fields are MessageSid, MessageStatus/SmsStatus,
    // ErrorCode and the standard request parameters, with no DateSent. The
    // create response is no help either, because a new message is still
    // `queued` and its dateSent is null. The Message Resource is the only
    // automated source, and this sweep already reads it.
    //
    // Before this, the sweep received `remote.dateSent` and dropped it on the
    // floor: message.date_sent was NULL for all 23,503 outbound rows of the
    // Lombardi blast, whose real send times ran up to 7.7 hours after our
    // recorded request time.

    test("persists the provider send time it already fetched", async () => {
      mocks.messageFindMany.mockResolvedValueOnce([
        { sid: "SM1", status: "sending", date_created: "2026-07-29T00:00:00Z", date_updated: null, date_sent: null },
      ]);
      mocks.messagesList.mockResolvedValue([
        {
          sid: "SM1",
          status: "delivered",
          errorCode: null,
          dateUpdated: new Date("2026-07-29T00:05:00Z"),
          dateSent: new Date("2026-07-29T00:04:30Z"),
        },
      ]);

      await triggerTwilioOpenSync({ workspaceId: "ws-1" });

      expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
        "ws-1",
        "SM1",
        expect.objectContaining({ date_sent: "2026-07-29T00:04:30.000Z" }),
      );
    });

    test("backfills a row that already settled but never recorded a send time", async () => {
      // This is the case that made the obvious one-line fix useless. A message
      // leaves OPEN_MESSAGE_STATUSES the instant it settles, so during a
      // 23,504-message blast the sweep (600 rows/hour) never observes most rows
      // while they are open, and they become unreachable by the open-row
      // selection forever. Their status already matches the provider, so the
      // "nothing changed" early-exit must not skip them.
      mocks.messageFindMany.mockResolvedValueOnce([]); // open rows: none
      mocks.messageFindMany.mockResolvedValueOnce([
        { sid: "SM_old", status: "delivered", date_created: "2026-05-01T00:00:00.000Z", date_updated: null, date_sent: null },
      ]); // backfill: the settled row with no send time
      mocks.messagesList.mockResolvedValue([]);
      mocks.messageFetch.mockResolvedValue({
        sid: "SM_old",
        status: "delivered",
        errorCode: null,
        dateUpdated: new Date("2026-05-01T00:06:00.000Z"),
        dateSent: new Date("2026-05-01T00:05:00.000Z"),
      });

      await triggerTwilioOpenSync({ workspaceId: "ws-1" });

      expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
        "ws-1",
        "SM_old",
        expect.objectContaining({ date_sent: "2026-05-01T00:05:00.000Z" }),
      );
      // Billing must NOT re-run. The row's status already matches the
      // provider, so its side effects already happened; a 23,504-row backfill
      // that re-enqueued billing per row would be 23,504 jobs rediscovering
      // that every message was already debited.
      expect(mocks.enqueueJob).not.toHaveBeenCalled();
    });

    test("skips a row that already has both the status and the send time", async () => {
      // Nothing to do means no write: the row already matches the provider on
      // every field this sweep owns, so re-writing it would emit a pointless
      // chat event.
      mocks.messageFindMany.mockResolvedValueOnce([
        { sid: "SM_done", status: "delivered", date_created: "2026-05-01T00:00:00.000Z", date_updated: "2026-05-01T00:05:00.000Z", date_sent: "2026-05-01T00:05:00.000Z" },
      ]);
      mocks.messagesList.mockResolvedValue([]);
      mocks.messageFetch.mockResolvedValue({
        sid: "SM_done",
        status: "delivered",
        errorCode: null,
        dateSent: new Date("2026-05-01T00:05:00.000Z"),
      });

      await triggerTwilioOpenSync({ workspaceId: "ws-1" });

      expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
    });

    test("never infers a send time from our own request time", async () => {
      // The provider reported no dateSent. Writing date_created into date_sent
      // would be the exact defect this ticket exists to remove: it would make
      // a 7-hour discrepancy look like a 0-second one.
      mocks.messageFindMany.mockResolvedValueOnce([
        { sid: "SM_none", status: "sending", date_created: "2026-07-29T00:00:00.000Z", date_updated: null, date_sent: null },
      ]);
      mocks.messagesList.mockResolvedValue([
        { sid: "SM_none", status: "delivered", errorCode: null, dateSent: null },
      ]);

      await triggerTwilioOpenSync({ workspaceId: "ws-1" });

      const update = mocks.updateMessageBySid.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(update).toBeDefined();
      expect(update.date_sent).toBeUndefined();
    });

    test("the backfill selection is bounded and does not consume the open-row budget", async () => {
      // Two independent budgets. The open-row sweep must stay a pure
      // lost-callback recovery path with no age bound (#1289: an age bound here
      // let stuck rows escape forever), so a large send-time backlog must not
      // be able to starve it.
      mocks.messagesList.mockResolvedValue([]);

      await triggerTwilioOpenSync({ workspaceId: "ws-1", messageLimit: 7, dateSentBackfillLimit: 3 });

      expect(mocks.messageFindMany).toHaveBeenCalledTimes(2);

      const referencedColumns = (callIndex: number) => {
        const columns = new Set<string>();
        const seen = new Set<object>();
        const walk = (node: unknown) => {
          if (node == null || typeof node !== "object" || seen.has(node)) return;
          seen.add(node);
          const name = (node as { name?: unknown }).name;
          const table = (node as { table?: unknown }).table;
          if (typeof name === "string" && table != null) {
            columns.add(name);
            return;
          }
          for (const value of Object.values(node)) walk(value);
        };
        walk(mocks.messageFindMany.mock.calls[callIndex]?.[0]?.where);
        return [...columns];
      };

      // Open rows: unchanged selection, its own limit, still no age bound.
      const openQuery = mocks.messageFindMany.mock.calls[0]?.[0] as { limit: number };
      expect(openQuery.limit).toBe(7);
      expect(referencedColumns(0)).toContain("status");
      expect(referencedColumns(0)).not.toContain("date_created");
      expect(referencedColumns(0)).not.toContain("date_sent");

      // Backfill: only rows that are missing a send time, inside an age window.
      const backfillQuery = mocks.messageFindMany.mock.calls[1]?.[0] as { limit: number };
      expect(backfillQuery.limit).toBe(3);
      expect(referencedColumns(1)).toContain("date_sent");
      expect(referencedColumns(1)).toContain("status");
      expect(referencedColumns(1)).toContain("date_created");
    });
  });

  test("a failed side-effects enqueue leaves the message open so the next sweep retries the debit", async () => {
    mocks.messageFindMany.mockResolvedValueOnce([
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
    mocks.messageFindMany.mockResolvedValueOnce([
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

  describe("pending intent rows (#1582 part 2)", () => {
    const intent = (over: Record<string, unknown> = {}) => ({
      sid: "pending:ref-1",
      client_ref: "ref-1",
      status: "queued",
      to: "+15555550100",
      from: "+15550000001",
      date_created: new Date(Date.now() - 30 * 60_000).toISOString(),
      date_updated: null,
      ...over,
    });

    test("a young pending intent is left alone", async () => {
      mocks.messageFindMany.mockResolvedValueOnce([intent({ date_created: new Date().toISOString() })]);
      mocks.messagesList.mockResolvedValue([]);
      await triggerTwilioOpenSync({ workspaceId: "ws-1" });
      expect(mocks.updateMessageBySid).not.toHaveBeenCalled();
      expect(mocks.resolveMessageByClientRef).not.toHaveBeenCalled();
    });

    test("a stale pending intent with a provider match is resolved, then billed through the normal path", async () => {
      mocks.messageFindMany.mockResolvedValueOnce([intent()]);
      mocks.messagesList.mockResolvedValue([
        { sid: "SM_other", status: "delivered", to: "+15555550199", from: "+15550000001", dateCreated: new Date(), errorCode: null },
        { sid: "SM_match", status: "delivered", to: "+15555550100", from: "+15550000001", dateCreated: new Date(Date.now() - 29 * 60_000), errorCode: null, dateUpdated: new Date() },
      ]);
      await triggerTwilioOpenSync({ workspaceId: "ws-1" });
      expect(mocks.resolveMessageByClientRef).toHaveBeenCalledWith("ws-1", "ref-1", { sid: "SM_match" });
      expect(mocks.enqueueJob).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "sms_status_side_effects:SM_match:delivered" }),
      );
      expect(mocks.updateMessageBySid).toHaveBeenCalledWith("ws-1", "SM_match", expect.objectContaining({ status: "delivered" }));
    });

    test("a stale intent without a from (Messaging Service send) matches on to alone", async () => {
      mocks.messageFindMany.mockResolvedValueOnce([intent({ from: null })]);
      mocks.messagesList.mockResolvedValue([
        { sid: "SM_svc", status: "delivered", to: "+15555550100", from: "+15550009999", dateCreated: new Date(Date.now() - 29 * 60_000), errorCode: null, dateUpdated: new Date() },
      ]);
      await triggerTwilioOpenSync({ workspaceId: "ws-1" });
      expect(mocks.resolveMessageByClientRef).toHaveBeenCalledWith("ws-1", "ref-1", { sid: "SM_svc" });
    });

    test("a stale pending intent with nothing at the provider is failed without a debit", async () => {
      mocks.messageFindMany.mockResolvedValueOnce([intent()]);
      mocks.messagesList.mockResolvedValue([
        { sid: "SM_before", status: "delivered", to: "+15555550100", from: "+15550000001", dateCreated: new Date(Date.now() - 60 * 60_000), errorCode: null },
      ]);
      await triggerTwilioOpenSync({ workspaceId: "ws-1" });
      expect(mocks.resolveMessageByClientRef).not.toHaveBeenCalled();
      expect(mocks.enqueueJob).not.toHaveBeenCalled();
      expect(mocks.updateMessageBySid).toHaveBeenCalledWith(
        "ws-1",
        "pending:ref-1",
        expect.objectContaining({ status: "failed" }),
      );
    });
  });

  test("non-terminal message drift updates the row but does not enqueue billing", async () => {
    mocks.messageFindMany.mockResolvedValueOnce([
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
