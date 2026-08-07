import { useState, useCallback } from "react";
import type { PostgresChangePayload } from "@/lib/workspace-events.shared";

export function useCreditBalance(initialCredits: number) {
  const [credits, setCredits] = useState(initialCredits);
  const [lastAppliedLedgerId, setLastAppliedLedgerId] = useState<number>(0);

  const applyLedgerEntry = useCallback(
    (payload: PostgresChangePayload) => {
      if (payload.eventType !== "INSERT") return;
      const newRow = payload.new as { id?: number; amount?: number } | null;
      if (!newRow || newRow.id == null || newRow.amount == null) return;
      if (newRow.id <= lastAppliedLedgerId) return;

      setCredits((prev) => prev + Number(newRow.amount!));
      setLastAppliedLedgerId(newRow.id!);
    },
    [lastAppliedLedgerId],
  );

  const applySnapshot = useCallback((newCredits: number) => {
    setCredits(newCredits);
    setLastAppliedLedgerId(0);
  }, []);

  const reconcileFromServer = useCallback(
    async (workspaceId: string) => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/credits`,
      );
      if (!res.ok) throw new Error(`Failed to reconcile credits: ${res.status}`);
      const data = (await res.json()) as { credits: number };
      applySnapshot(data.credits);
    },
    [applySnapshot],
  );

  return {
    credits,
    applyLedgerEntry,
    applySnapshot,
    reconcileFromServer,
  };
}
