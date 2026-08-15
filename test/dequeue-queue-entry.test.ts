import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Unit tests for dequeueQueueEntry's routing logic (app/lib/campaign-queue-db.server.ts,
 * issue #1240 B3) — the single QueueEntry dequeue entry point that replaced
 * direct calls to dequeueCampaignQueueById, dequeueCampaignQueueByContact,
 * and rpcDequeueContact across the app.
 *
 * `@/lib/db-rpc.server` is mocked wholesale so these tests exercise only the
 * routing decision (which mechanism gets called, with what args), not the
 * RPC's own household-lookup/emit behavior — that's covered by
 * scope-dequeue-and-outreach-attempt.integration.test.ts and manual
 * verification against a live Postgres instance (see that file's header).
 */

const rpcDequeueContactMock = vi.hoisted(() => vi.fn(async () => undefined));

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(async () => []),
  // createTenantDb() (app/server/tenant-db.ts) eagerly reads db.query.<table>
  // for every workspace-scoped table at construction time, even though the
  // household RPC path (rpcDequeueContact, mocked wholesale below) never
  // calls into it — a Proxy avoids having to enumerate every table.
  query: new Proxy(
    {},
    { get: () => ({ findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(undefined) }) },
  ),
}));

const emitQueueEventMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/server/db", () => ({ db: dbMocks }));
vi.mock("@/lib/workspace-events.server", () => ({
  emitQueueEvent: (...args: unknown[]) => emitQueueEventMock(...args),
}));
vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: (...args: unknown[]) => rpcDequeueContactMock(...args),
}));

// Captured `set` payloads and `where` filters from db.update().set(...).where(...) calls.
let updateSetCalls: unknown[] = [];
let updateCount = 0;

function installDbMockImplementations() {
  dbMocks.select.mockImplementation(() => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      then: (onFulfilled: any) => Promise.resolve([]).then(onFulfilled),
    };
    return chain;
  });
  dbMocks.update.mockImplementation(() => ({
    set: (setPayload: unknown) => {
      updateSetCalls.push(setPayload);
      updateCount++;
      return {
        where: () => ({
          returning: () => Promise.resolve([{ id: 1, workspace: "workspace-1" }]),
        }),
      };
    },
  }));
}

beforeEach(() => {
  dbMocks.select.mockReset();
  dbMocks.update.mockReset();
  dbMocks.execute.mockReset();
  emitQueueEventMock.mockClear();
  rpcDequeueContactMock.mockReset();
  rpcDequeueContactMock.mockResolvedValue(undefined);
  updateSetCalls = [];
  updateCount = 0;
  installDbMockImplementations();
});

describe("dequeueQueueEntry routing", () => {
  test("by: { id } always uses the plain-Drizzle mechanism, never the RPC", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await dequeueQueueEntry({
      by: { id: 42 },
      userId: "user-1",
      reason: "SMS message sent",
      workspaceId: "workspace-1",
    });

    expect(updateCount).toBe(1);
    expect(updateSetCalls[0]).toMatchObject({
      queue_state: "dequeued",
      dequeued_by: "user-1",
      dequeued_reason: "SMS message sent",
    });
    expect(rpcDequeueContactMock).not.toHaveBeenCalled();
  });

  test("by: { contactId } with household omitted uses the plain-Drizzle mechanism", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await dequeueQueueEntry({
      by: { contactId: 7, campaignId: 99 },
      userId: null,
      reason: "Contact opted out via SMS",
      workspaceId: "workspace-1",
    });

    expect(updateCount).toBe(1);
    expect(updateSetCalls[0]).toMatchObject({
      queue_state: "dequeued",
      dequeued_by: null,
      dequeued_reason: "Contact opted out via SMS",
    });
    expect(rpcDequeueContactMock).not.toHaveBeenCalled();
  });

  test("by: { contactId }, household: true uses the household-aware RPC with fan-out", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await dequeueQueueEntry({
      by: { contactId: 7 },
      userId: "user-1",
      reason: "Predictive Dialer called contact",
      workspaceId: "workspace-1",
      household: true,
    });

    expect(rpcDequeueContactMock).toHaveBeenCalledTimes(1);
    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactId: 7,
        workspaceId: "workspace-1",
        groupOnHousehold: true,
        dequeuedById: "user-1",
        dequeuedReasonText: "Predictive Dialer called contact",
      }),
    );
    expect(updateCount).toBe(0);
  });

  test("by: { contactId }, household: false STILL uses the guarded RPC, not plain Drizzle", async () => {
    // Preserves app/lib/auto-dial.server.ts's ambiguous-dial-park behavior:
    // `false` is a deliberate, distinct third mode (guarded single-contact
    // RPC dequeue), not an alias for the Drizzle default.
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await dequeueQueueEntry({
      by: { contactId: 7 },
      userId: "user-1",
      reason: "Ambiguous dial failure — call may exist at Twilio; parked for review, not redialed",
      workspaceId: "workspace-1",
      household: false,
    });

    expect(rpcDequeueContactMock).toHaveBeenCalledTimes(1);
    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ groupOnHousehold: false }),
    );
    expect(updateCount).toBe(0);
  });

  test("household routing passes through an explicit exec instead of building a new one", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");
    const explicitExec = { execute: vi.fn(async () => []) };

    await dequeueQueueEntry({
      by: { contactId: 7 },
      userId: "user-1",
      reason: "Call completed",
      workspaceId: "workspace-1",
      household: true,
      exec: explicitExec,
    });

    expect(rpcDequeueContactMock).toHaveBeenCalledWith(
      explicitExec,
      expect.objectContaining({ groupOnHousehold: true }),
    );
  });

  test("household routing without an explicit exec builds a tenant-scoped one from workspaceId", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await dequeueQueueEntry({
      by: { contactId: 7 },
      userId: "user-1",
      reason: "Call completed",
      workspaceId: "workspace-1",
      household: true,
    });

    const [execArg] = rpcDequeueContactMock.mock.calls[0] as [unknown, unknown];
    expect(execArg).not.toBe(undefined);
    expect(typeof (execArg as { execute?: unknown }).execute).toBe("function");
  });

  test("household routing throws without a workspaceId (the RPC requires one)", async () => {
    const { dequeueQueueEntry } = await import("@/lib/campaign-queue-db.server");

    await expect(
      dequeueQueueEntry({
        by: { contactId: 7 },
        userId: "user-1",
        reason: "Call completed",
        household: true,
      }),
    ).rejects.toThrow(/workspaceId/);
    expect(rpcDequeueContactMock).not.toHaveBeenCalled();
  });
});
