import { useState, useCallback, useRef } from "react";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";

export function useCreditBalance(initialCredits: number) {
  const [credits, setCredits] = useState(initialCredits);
  // Ref, not state: applyLedgerEntry and reconcileFromServer must observe the
  // latest applied ledger id synchronously (SSE events and fetch responses can
  // interleave within one render), and dedup must survive applySnapshot.
  const lastAppliedLedgerIdRef = useRef(0);

  const applyLedgerEntry = useCallback((payload: PostgresChangePayload) => {
    if (payload.eventType !== "INSERT") return;
    const newRow = payload.new as { id?: number; amount?: number } | null;
    if (!newRow || newRow.id == null || newRow.amount == null) return;
    if (newRow.id <= lastAppliedLedgerIdRef.current) return;

    lastAppliedLedgerIdRef.current = newRow.id;
    setCredits((prev) => prev + Number(newRow.amount));
  }, []);

  const applySnapshot = useCallback((newCredits: number) => {
    // The snapshot is an authoritative balance that already includes every
    // ledger row it postdates — keep the dedup watermark so a duplicate SSE
    // delivery of an already-applied event cannot re-apply on top of it.
    setCredits(newCredits);
  }, []);

  /**
   * Fetch the authoritative balance and apply it, unless a newer ledger event
   * arrived while the request was in flight (the snapshot would then predate
   * local state). Returns the applied balance, or null when skipped.
   */
  const reconcileFromServer = useCallback(
    async (workspaceId: string): Promise<number | null> => {
      const ledgerIdAtFetch = lastAppliedLedgerIdRef.current;
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/credits`,
      );
      if (!res.ok) throw new Error(`Failed to reconcile credits: ${res.status}`);
      const data = (await res.json()) as { credits: number };
      if (lastAppliedLedgerIdRef.current !== ledgerIdAtFetch) return null;
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
