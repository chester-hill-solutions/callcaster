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
  test("applies ledger inserts and ignores duplicate deliveries", () => {
    const { result } = renderHook(() => useCreditBalance(10));

    act(() => result.current.applyLedgerEntry(ledgerInsert(5, -2)));
    expect(result.current.credits).toBe(8);

    act(() => result.current.applyLedgerEntry(ledgerInsert(5, -2)));
    expect(result.current.credits).toBe(8);
  });

  /**
   * #2120 — the defect this whole change exists for.
   *
   * `transaction_history` is written by concurrent transactions and the SSE
   * endpoint guarantees no commit ordering, so a lower id can arrive after a
   * higher one. The old high-water mark (`id <= lastApplied` → skip) dropped it,
   * permanently and silently, and because the resulting imbalance is exactly what
   * stops `useCreditReconciliation` polling, nothing ever corrected it.
   *
   * Both rows must apply. This is the kill-check: restore the high-water mark and
   * it goes red on the 104 delivery.
   */
  test("applies out-of-order ledger rows instead of dropping them", () => {
    const { result } = renderHook(() => useCreditBalance(10));

    act(() => result.current.applyLedgerEntry(ledgerInsert(105, -2)));
    expect(result.current.credits).toBe(8);

    // Arrives late, because its transaction committed after 105's.
    act(() => result.current.applyLedgerEntry(ledgerInsert(104, -3)));
    expect(result.current.credits).toBe(5);
  });

  test("a duplicate of an out-of-order row still applies only once", () => {
    const { result } = renderHook(() => useCreditBalance(10));

    act(() => result.current.applyLedgerEntry(ledgerInsert(105, -2)));
    act(() => result.current.applyLedgerEntry(ledgerInsert(104, -3)));
    expect(result.current.credits).toBe(5);

    // Both delivered a second time.
    act(() => result.current.applyLedgerEntry(ledgerInsert(105, -2)));
    act(() => result.current.applyLedgerEntry(ledgerInsert(104, -3)));
    expect(result.current.credits).toBe(5);
  });

  test("the applied-id set is bounded, and a long stream still applies", () => {
    const { result } = renderHook(() => useCreditBalance(1000));

    // More ids than the guard retains, delivered ascending.
    for (let id = 1; id <= 800; id += 1) {
      act(() => result.current.applyLedgerEntry(ledgerInsert(id, -1)));
    }
    expect(result.current.credits).toBe(1000 - 800);

    // The newest id is still remembered, so a duplicate of it is ignored. This
    // is what eviction must preserve: an unbounded set is a memory leak on a
    // long-lived tab, and evicting the newest entry would reintroduce #2120.
    act(() => result.current.applyLedgerEntry(ledgerInsert(800, -1)));
    expect(result.current.credits).toBe(1000 - 800);
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

  /**
   * Reverses #1234's "skip a snapshot that raced a newer ledger event" rule, on
   * purpose. That rule was defensible about the race and fatal about the
   * consequence: the reconciliation poll stops the moment the balance moves, so
   * a skipped snapshot means a balance that is never corrected (#2120).
   *
   * A delta that commits during the fetch may be briefly absent from the
   * snapshot; the next poll corrects it within one tick. Never reconciling is not
   * recoverable, one tick behind is.
   */
  test("reconcileFromServer applies the snapshot even when a ledger event raced it", async () => {
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

    // A ledger debit lands while the balance request is in flight.
    act(() => result.current.applyLedgerEntry(ledgerInsert(9, -5)));
    expect(result.current.credits).toBe(5);

    let applied: number | null = null;
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ credits: 10 }) });
      applied = await pending;
    });

    // The server's number wins: it is the ledger's own sum, and the poll that
    // called this will correct any later delta.
    expect(applied).toBe(10);
    expect(result.current.credits).toBe(10);
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
