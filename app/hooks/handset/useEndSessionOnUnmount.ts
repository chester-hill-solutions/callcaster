import { useEffect, useRef } from "react";

/** Runs the latest `endSession` exactly once when the component unmounts. */
export function useEndSessionOnUnmount(endSession: () => void): void {
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;
  /**
   * @effect Call the latest endSession() exactly once, on unmount.
   * @effect-deps none — intentionally empty deps; endSessionRef is kept current outside the effect
   *   so unmount always calls the latest callback without re-registering the cleanup.
   * @effect-side-effects none (in itself) — invokes the caller-supplied endSession, whose own side
   *   effects (e.g. hanging up a call) are the caller's responsibility.
   * @effect-why-not-loader Not data fetching — this is a mount-lifecycle cleanup hook (unmount handler).
   */
  useEffect(() => () => endSessionRef.current(), []);
}
