import { useEffect, useRef } from "react";

/**
 * Runs `run` once per distinct JSON-serialized `payload` while `active` is true.
 * Reduces duplicate toasts when `useActionData` is stable across re-renders.
 * If `run` returns a function, it is used as the effect cleanup (e.g. clearTimeout).
 * Other return values (e.g. sonner toast ids) are ignored.
 */
export function useToastOnNewJsonPayload(
  payload: unknown,
  active: boolean,
  run: () => unknown,
) {
  const lastKeyRef = useRef<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!active) return;
    const key = JSON.stringify(payload);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    const maybeCleanup = runRef.current();
    return typeof maybeCleanup === "function"
      ? (maybeCleanup as () => void)
      : undefined;
  }, [active, payload]);
}
