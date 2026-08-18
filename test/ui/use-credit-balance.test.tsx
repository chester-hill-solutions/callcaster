import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useCreditBalance } from "@/hooks/billing/useCreditBalance";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";

function ledgerInsert(id: number, amount: number): PostgresChangePayload {
  return {
    eventType: "INSERT",
    table: "transaction_history",
    new: { id, amount },
    old: null,
  } as unknown as PostgresChangePayload;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCreditBalance", () => {
  test("applies ledger inserts and ignores duplicate or older ids", () => {
    const { result } = renderHook(() => useCreditBalance(10));

    act(() => result.current.applyLedgerEntry(ledgerInsert(5, -2)));
    expect(result.current.credits).toBe(8);

    act(() => result.current.applyLedgerEntry(ledgerInsert(5, -2)));
    expect(result.current.credits).toBe(8);

    act(() => result.current.applyLedgerEntry(ledgerInsert(4, -3)));
    expect(result.current.credits).toBe(8);
  });

  test("duplicate ledger event after a snapshot does not re-apply (#1234)", () => {
    const { result } = renderHook(() => useCreditBalance(10));

    act(() => result.current.applyLedgerEntry(ledgerInsert(7, -4)));
    expect(result.current.credits).toBe(6);

    // Authoritative snapshot lands (e.g. reconciliation) with the same balance.
    act(() => result.current.applySnapshot(6));
    expect(result.current.credits).toBe(6);

    // A duplicate SSE delivery of the already-applied event must be ignored —
    // previously applySnapshot reset the watermark and this double-debited.
    act(() => result.current.applyLedgerEntry(ledgerInsert(7, -4)));
    expect(result.current.credits).toBe(6);
  });

  test("reconcileFromServer applies the fetched balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ credits: 42 }),
      }),
    );
    const { result } = renderHook(() => useCreditBalance(10));

    let applied: number | null = null;
    await act(async () => {
      applied = await result.current.reconcileFromServer("ws-1");
    });

    expect(applied).toBe(42);
    expect(result.current.credits).toBe(42);
    expect(fetch).toHaveBeenCalledWith("/api/workspaces/ws-1/credits");
  });

  test("reconcileFromServer skips a snapshot that raced a newer ledger event", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve))),
    );
    const { result } = renderHook(() => useCreditBalance(10));

    let pending!: Promise<number | null>;
    act(() => {
      pending = result.current.reconcileFromServer("ws-1");
    });

    // A ledger debit arrives while the balance request is in flight; the
    // response snapshot predates it and must not clobber the newer state.
    act(() => result.current.applyLedgerEntry(ledgerInsert(9, -5)));
    expect(result.current.credits).toBe(5);

    let applied: number | null = 0;
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ credits: 10 }) });
      applied = await pending;
    });

    expect(applied).toBeNull();
    expect(result.current.credits).toBe(5);
  });

  test("reconcileFromServer throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { result } = renderHook(() => useCreditBalance(10));

    await expect(result.current.reconcileFromServer("ws-1")).rejects.toThrow(
      "Failed to reconcile credits: 500",
    );
    expect(result.current.credits).toBe(10);
  });
});
