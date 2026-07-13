import { useEffect, useRef } from "react";

/** Returns a scheduler for a single deferred callback; pending timer is cleared on re-schedule and unmount. */
export function useTimeoutFn(): (ms: number, fn: () => void) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * @effect Clear any pending scheduled timeout when the component unmounts.
   * @effect-deps none — intentionally empty deps; the returned scheduler function reads/writes
   *   timerRef directly and isn't recreated per render, so there's nothing else to react to.
   * @effect-side-effects timer (clearTimeout on unmount only)
   * @effect-why-not-loader Not data fetching — this is cleanup for a client-only deferred callback timer.
   */
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (ms, fn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  };
}
