import { useState, useCallback, useRef } from "react";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";

/**
 * How many applied ledger ids to remember.
 *
 * The set is a duplicate-delivery guard, not a ledger: it exists so an SSE
 * event delivered twice is applied once. It does not need to be complete, only
 * recent, so it is bounded rather than allowed to grow for the life of a tab.
 * A workspace running a long-lived tab would otherwise accumulate one entry per
 * billing event it ever saw.
 */
const MAX_TRACKED_LEDGER_IDS = 500;

export function useCreditBalance(initialCredits: number) {
  const [credits, setCredits] = useState(initialCredits);
  // Ref, not state: applyLedgerEntry and reconcileFromServer must observe the
  // latest applied ledger ids synchronously (SSE events and fetch responses can
  // interleave within one render).
  //
  // This was a single `lastAppliedLedgerId` high-water mark, which is only a
  // correct dedup for a strictly ordered stream. `transaction_history` is
  // written by concurrent transactions and the SSE endpoint guarantees no
  // commit ordering, so a row arriving after a higher id was silently dropped —
  // forever, with no way to recover it. A set of applied ids makes dedup
  // order-independent: 105 then 104 both apply, and a repeated 105 still does
  // not.
  const appliedLedgerIdsRef = useRef<Set<number>>(new Set());
  /** Insertion order, so eviction can drop the oldest id rather than an arbitrary one. */
  const appliedLedgerOrderRef = useRef<number[]>([]);

  const applyLedgerEntry = useCallback((payload: PostgresChangePayload) => {
    if (payload.eventType !== "INSERT") return;
    const newRow = payload.new as { id?: number; amount?: number } | null;
    if (!newRow || newRow.id == null || newRow.amount == null) return;
    if (appliedLedgerIdsRef.current.has(newRow.id)) return;

    appliedLedgerIdsRef.current.add(newRow.id);
    appliedLedgerOrderRef.current.push(newRow.id);
    if (appliedLedgerOrderRef.current.length > MAX_TRACKED_LEDGER_IDS) {
      const evicted = appliedLedgerOrderRef.current.shift();
      if (evicted != null) appliedLedgerIdsRef.current.delete(evicted);
    }

    setCredits((prev) => prev + Number(newRow.amount));
  }, []);

  const applySnapshot = useCallback((newCredits: number) => {
    // The snapshot is an authoritative balance that already includes every
    // ledger row it postdates. The applied-id set is deliberately NOT cleared:
    // it is what stops a duplicate SSE delivery of an already-applied event from
    // re-applying on top of the snapshot (#1234).
    setCredits(newCredits);
  }, []);

  /**
   * Fetch the authoritative balance and apply it.
   *
   * ## Why this applies unconditionally
   *
   * This used to bail out when a ledger event arrived while the request was in
   * flight, on the reasoning that the snapshot predates it. That reasoning is
   * right about the race and catastrophic about the consequence: the caller
   * (`useCreditReconciliation`) stops polling as soon as the balance moves, so
   * a skipped snapshot is a balance that is never corrected for the life of the
   * tab. The recovery loop was gated on exactly the condition the bug created
   * (#2120).
   *
   * A delta that commits during the fetch may be momentarily absent from the
   * snapshot. That is the better failure: the balance is briefly behind and the
   * next poll — 2s later, for up to 30s — corrects it. "Never reconciles" is not
   * recoverable; "one tick behind" is.
   */
  const reconcileFromServer = useCallback(
    async (workspaceId: string): Promise<number | null> => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/credits`,
      );
      if (!res.ok) throw new Error(`Failed to reconcile credits: ${res.status}`);
      const data = (await res.json()) as { credits: number };
      setCredits(data.credits);
      return data.credits;
    },
    [],
  );

  return {
    credits,
    applyLedgerEntry,
    applySnapshot,
    reconcileFromServer,
  };
}