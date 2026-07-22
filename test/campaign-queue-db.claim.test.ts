import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Unit tests for the opt-out claim guard in claimNextQueueContact
 * (app/lib/campaign-queue-db.server.ts): the claim_next_queue_contact RPC does
 * not filter on contact.opt_out, so the TS wrapper must dequeue opted-out
 * claims and try again (bounded).
 */

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const emitQueueEventMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/server/db", () => ({ db: dbMocks }));
vi.mock("@/lib/workspace-events.server", () => ({
  emitQueueEvent: (...args: unknown[]) => emitQueueEventMock(...args),
}));

// Per-test responder: returns the rows for the Nth db.select() call.
let selectResponder: (callIndex: number) => unknown[] = () => [];
let selectCallCount = 0;

// Captured `set` payloads from db.update().set(...) calls.
let updateSetCalls: unknown[] = [];

function installDbMockImplementations() {
  dbMocks.select.mockImplementation(() => {
    const callIndex = selectCallCount++;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(selectResponder(callIndex)),
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(selectResponder(callIndex)).then(onFulfilled, onRejected),
    };
    return chain;
  });
  dbMocks.update.mockImplementation(() => ({
    set: (setPayload: unknown) => {
      updateSetCalls.push(setPayload);
      return {
        where: () => ({
          returning: () => Promise.resolve([{ id: 999, workspace: "w1" }]),
        }),
      };
    },
  }));
}

function makeTdb(executeMock: ReturnType<typeof vi.fn>) {
  return { execute: executeMock } as any;
}

const claimRow = (contactId: number, queueId: number) => ({
  contact_id: contactId,
  queue_id: queueId,
  caller_id: "+15550001111",
  contact_phone: "+15550002222",
});

describe("claimNextQueueContact opt-out guard", () => {
  beforeEach(() => {
    dbMocks.select.mockReset();
    dbMocks.update.mockReset();
    emitQueueEventMock.mockClear();
    selectCallCount = 0;
    updateSetCalls = [];
    selectResponder = () => [];
    installDbMockImplementations();
  });

  test("returns the claimed row when the contact is not opted out", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValueOnce([claimRow(5, 11)]);
    // Call order: queue row lookup, then contact opt_out lookup.
    const responses = [[{ id: 11, workspace: "w1" }], [{ opt_out: false }]];
    selectResponder = (i) => responses[i] ?? [];

    const result = await claimNextQueueContact(makeTdb(execute), 1, "user-1");

    expect(result).toEqual(claimRow(5, 11));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  test("returns null when no row is claimed", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValueOnce([]);

    const result = await claimNextQueueContact(makeTdb(execute), 1, "user-1");

    expect(result).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  test("dequeues an opted-out claim and returns the next non-opted-out contact", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi
      .fn()
      .mockResolvedValueOnce([claimRow(5, 11)])
      .mockResolvedValueOnce([claimRow(6, 12)]);
    const responses = [
      // iteration 1: queue row, opted-out contact, dequeue's old-rows read
      [{ id: 11, workspace: "w1" }],
      [{ opt_out: true }],
      [{ id: 11, workspace: "w1" }],
      // iteration 2: queue row, contact ok
      [{ id: 12, workspace: "w1" }],
      [{ opt_out: false }],
    ];
    selectResponder = (i) => responses[i] ?? [];

    const result = await claimNextQueueContact(makeTdb(execute), 1, "user-1");

    expect(result).toEqual(claimRow(6, 12));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(dbMocks.update).toHaveBeenCalledTimes(1);
    expect(updateSetCalls[0]).toMatchObject({
      queue_state: "dequeued",
      dequeued_by: "user-1",
      dequeued_reason: "Contact opted out",
    });
  });

  test("gives up after 10 opted-out claims and returns null", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValue([claimRow(5, 11)]);
    // Every iteration: queue row, opted-out contact, dequeue's old-rows read.
    selectResponder = (i) => {
      const step = i % 3;
      if (step === 0) return [{ id: 11, workspace: "w1" }];
      if (step === 1) return [{ opt_out: true }];
      return [{ id: 11, workspace: "w1" }];
    };

    const result = await claimNextQueueContact(makeTdb(execute), 1, "user-1");

    expect(result).toBeNull();
    expect(execute).toHaveBeenCalledTimes(10);
    expect(dbMocks.update).toHaveBeenCalledTimes(10);
  });
});
