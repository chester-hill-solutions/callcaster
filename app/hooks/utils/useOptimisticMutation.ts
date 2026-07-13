import { useEffect, useRef, useCallback } from "react";
import type { Fetcher } from "react-router";
import { toast } from "sonner";
import { logger } from "@/lib/logger.client";

type ToastAPI = {
  success: (message: string) => void;
  error: (message: string) => void;
};

/**
 * Hook for optimistic mutations with rollback on server error.
 *
 * Applies optimistic updates immediately, tracks pending state for rollback,
 * and reverts + shows toast when the fetcher returns an error.
 *
 * @param params - Configuration object
 * @param params.fetcher - Remix fetcher (useFetcher)
 * @param params.isError - Function to detect error from fetcher.data (e.g. (d) => d?.error)
 * @param params.onRollback - Called when error detected; should restore previous state
 * @param params.errorMessage - Toast message on rollback (default: "Action failed. Changes reverted.")
 * @param params.toast - Optional toast API; defaults to sonner
 */
export function useOptimisticMutation<TData = unknown>({
  fetcher,
  isError,
  onRollback,
  errorMessage = "Action failed. Changes reverted.",
  toast: toastApi,
}: {
  fetcher: Fetcher<TData>;
  isError: (data: TData | undefined) => boolean;
  onRollback: () => void;
  errorMessage?: string;
  toast?: ToastAPI;
}) {
  const rollbackRef = useRef(onRollback);
  const lastDataRef = useRef<TData | undefined>(undefined);

  /**
   * @effect Keep rollbackRef current so the fetcher-watching effect below can call the latest onRollback.
   * @effect-deps onRollback (re-syncs the ref whenever a new callback identity is passed in)
   * @effect-side-effects none — mutates a ref only
   * @effect-why-not-loader Not data fetching — "latest ref" pattern avoiding onRollback in the next effect's deps.
   */
  useEffect(() => {
    rollbackRef.current = onRollback;
  }, [onRollback]);

  /**
   * @effect CANDIDATE-REMOVE Detect a failed mutation (fetcher settled with an error) and roll back + toast.
   * @effect-deps fetcher.state, fetcher.data (identity-guarded via lastDataRef so it only reacts once
   *   per new response), isError, errorMessage, toastApi
   * @effect-side-effects none directly — reads fetcher state; calls rollbackRef.current() and toast.error
   * @effect-why-not-loader Same pattern app/hooks/utils/useFetcherOnIdle.ts exists to replace: hand-rolled
   *   fetcher.state/fetcher.data watching duplicates that hook's busy->idle edge detection. Could migrate
   *   to `useFetcherOnIdle(fetcher, (data) => { if (isError(data)) { rollback(); toast... } })`.
   */
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data as TData;
    if (lastDataRef.current === data) return;
    lastDataRef.current = data;

    if (isError(data)) {
      logger.warn("Optimistic mutation failed, rolling back", data);
      rollbackRef.current();
      (toastApi ?? toast).error(errorMessage);
    }
  }, [fetcher.state, fetcher.data, isError, errorMessage, toastApi]);
}

/**
 * Hook for optimistic collection operations (remove/update) with rollback.
 *
 * Stores a snapshot of items before the optimistic change and restores it on error.
 *
 * @param items - Current collection (e.g. contacts, queue items)
 * @param setItems - State setter for the collection
 * @param fetcher - Remix fetcher
 * @param isError - Function to detect error from fetcher.data
 * @param options - Optional error message and toast
 */
export function useOptimisticCollection<T extends { id: number | string }>({
  items,
  setItems,
  fetcher,
  isError,
  errorMessage = "Action failed. Changes reverted.",
  toast: toastApi,
}: {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  fetcher: Fetcher<unknown>;
  isError: (data: unknown) => boolean;
  errorMessage?: string;
  toast?: ToastAPI;
}) {
  const snapshotRef = useRef<T[] | null>(null);

  const saveSnapshot = useCallback(() => {
    snapshotRef.current = [...items];
  }, [items]);

  const rollback = useCallback(() => {
    if (snapshotRef.current !== null) {
      setItems(snapshotRef.current);
      snapshotRef.current = null;
    }
  }, [setItems]);

  useOptimisticMutation({
    fetcher,
    isError,
    onRollback: rollback,
    errorMessage,
    toast: toastApi,
  });

  return { saveSnapshot, rollback };
}
