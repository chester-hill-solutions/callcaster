import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  ledgerRow: null as null | {
    id: number;
    inserted: boolean;
    amount: number;
    type: string;
    idempotency_key: string;
    workspace: string;
  },
  emitTransactionHistoryInsertEvent: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: vi.fn(async () => (mocks.ledgerRow ? [mocks.ledgerRow] : [])),
  },
}));

vi.mock("@/lib/workspace-events.server", () => ({
  emitTransactionHistoryInsertEvent: (...args: unknown[]) =>
    mocks.emitTransactionHistoryInsertEvent(...args),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: mocks.logger,
}));

describe("insertTransactionHistoryIdempotent event emission", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ledgerRow = null;
    mocks.emitTransactionHistoryInsertEvent.mockReset();
    mocks.emitTransactionHistoryInsertEvent.mockResolvedValue({ id: 1 });
    mocks.logger.info.mockReset();
    mocks.logger.error.mockReset();
  });

  test("emits a transaction_history INSERT event when the ledger row is new", async () => {
    mocks.ledgerRow = {
      id: 11,
      inserted: true,
      amount: -5,
      type: "DEBIT",
      idempotency_key: "call:CA123:voice",
      workspace: "ws-1",
    };

    const { insertTransactionHistoryIdempotent } = await import(
      "../app/lib/transaction-history.server"
    );
    const { db } = await import("@/server/db");
    const result = await insertTransactionHistoryIdempotent(db, {
      workspaceId: "ws-1",
      type: "DEBIT",
      amount: -5,
      note: "Call debit",
      idempotencyKey: "call:CA123:voice",
    });

    expect(result).toEqual({ inserted: true, existingId: 11 });
    expect(mocks.emitTransactionHistoryInsertEvent).toHaveBeenCalledWith("ws-1", {
      id: 11,
      workspace: "ws-1",
      type: "DEBIT",
      amount: -5,
      idempotency_key: "call:CA123:voice",
    });
  });

  test("does not emit for idempotent duplicate ledger rows", async () => {
    mocks.ledgerRow = {
      id: 11,
      inserted: false,
      amount: -5,
      type: "DEBIT",
      idempotency_key: "call:CA123:voice",
      workspace: "ws-1",
    };

    const { insertTransactionHistoryIdempotent } = await import(
      "../app/lib/transaction-history.server"
    );
    const { db } = await import("@/server/db");
    const result = await insertTransactionHistoryIdempotent(db, {
      workspaceId: "ws-1",
      type: "DEBIT",
      amount: -5,
      note: "Call debit",
      idempotencyKey: "call:CA123:voice",
    });

    expect(result).toEqual({ inserted: false, existingId: 11 });
    expect(mocks.emitTransactionHistoryInsertEvent).not.toHaveBeenCalled();
  });

  test("keeps a successful ledger write when event emission fails", async () => {
    mocks.ledgerRow = {
      id: 22,
      inserted: true,
      amount: 100,
      type: "CREDIT",
      idempotency_key: "stripe_session:sess_1",
      workspace: "ws-1",
    };
    mocks.emitTransactionHistoryInsertEvent.mockRejectedValueOnce(
      new Error("notify failed"),
    );

    const { insertTransactionHistoryIdempotent } = await import(
      "../app/lib/transaction-history.server"
    );
    const { db } = await import("@/server/db");
    const result = await insertTransactionHistoryIdempotent(db, {
      workspaceId: "ws-1",
      type: "CREDIT",
      amount: 100,
      note: "Added credits",
      idempotencyKey: "stripe_session:sess_1",
    });

    expect(result).toEqual({ inserted: true, existingId: 22 });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  // Kept from the deleted test/billing-idempotency.test.ts. The rest of that
  // file re-implemented apply_ledger_entry_and_sync_credits in JS; these two
  // are wrapper behaviour that never needed a database at all. The RPC's own
  // behaviour is covered in test/integration-db/ledger.test.ts.
  test("rejects a blank idempotency key before reaching the database", async () => {
    const { insertTransactionHistoryIdempotent } = await import(
      "../app/lib/transaction-history.server"
    );
    const { db } = await import("@/server/db");

    await expect(
      insertTransactionHistoryIdempotent(db, {
        workspaceId: "ws-1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "   ",
      }),
    ).rejects.toThrow("idempotencyKey is required");

    expect(db.execute).not.toHaveBeenCalled();
  });

  test("propagates a failing ledger RPC", async () => {
    const { insertTransactionHistoryIdempotent } = await import(
      "../app/lib/transaction-history.server"
    );
    const { db } = await import("@/server/db");
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("rpc failed"),
    );

    await expect(
      insertTransactionHistoryIdempotent(db, {
        workspaceId: "ws-1",
        type: "DEBIT",
        amount: -1,
        note: "n",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("rpc failed");
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});
