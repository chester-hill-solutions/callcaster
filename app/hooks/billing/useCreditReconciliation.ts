import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger.client";

export const CREDIT_RECONCILE_INTERVAL_MS = 2_000;
export const CREDIT_RECONCILE_WINDOW_MS = 30_000;

type UseCreditReconciliationOptions = {
  workspaceId: string;
  /** True while the campaign call screen shows a terminal outcome. */
  isTerminal: boolean;
  /** Current balance from useCreditBalance — used to detect convergence. */
  credits: number;
  /** useCreditBalance.reconcileFromServer */
  reconcile: (workspaceId: string) => Promise<number | null>;
};

/**
 * Bounded credit reconciliation after a terminal campaign call (#1234).
 *
 * Billing is server-authoritative and normally reaches the UI as a ledger SSE
 * event. If that event is missed, the balance shown on the call screen is
 * stale until reload. When a call reaches a terminal outcome, poll the narrow
 * balance endpoint every 2s for up to 30s, stopping early as soon as the
 * balance moves (SSE debit or fetched snapshot), a new dial starts (isTerminal
 * drops), or the screen unmounts.
 */
export function useCreditReconciliation({
  workspaceId,
  isTerminal,
  credits,
  reconcile,
}: UseCreditReconciliationOptions) {
  const creditsRef = useRef(credits);
  creditsRef.current = credits;
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  /**
   * @effect Poll the workspace balance endpoint after a terminal call until the credit display converges on the ledger.
   * @effect-deps isTerminal (call reached/left a terminal outcome), workspaceId
   * @effect-side-effects setInterval polling GET /api/workspaces/:workspaceId/credits (max 30s, 2s cadence); cleared on convergence, timeout, new dial, unmount
   * @effect-why-not-loader Convergence is a client-time bounded retry against a missed SSE event; a loader only runs on navigation/revalidation and cannot poll.
   */
  useEffect(() => {
    if (!isTerminal || !workspaceId) return;

    const baseline = creditsRef.current;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (
        creditsRef.current !== baseline ||
        Date.now() - startedAt >= CREDIT_RECONCILE_WINDOW_MS
      ) {
        clearInterval(interval);
        return;
      }
      void reconcileRef.current(workspaceId).catch((error) => {
        // Transient fetch failures just wait for the next tick.
        logger.debug("credit reconciliation poll failed", { error });
      });
    }, CREDIT_RECONCILE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isTerminal, workspaceId]);
}
