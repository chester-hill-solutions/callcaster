import { useEffect, useRef } from "react";

/** Returns a scheduler for a single deferred callback; pending timer is cleared on re-schedule and unmount. */
export function useTimeoutFn(): (ms: number, fn: () => void) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (ms, fn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  };
}
