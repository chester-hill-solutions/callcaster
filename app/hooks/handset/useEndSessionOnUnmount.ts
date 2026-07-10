import { useEffect, useRef } from "react";

/** Runs the latest `endSession` exactly once when the component unmounts. */
export function useEndSessionOnUnmount(endSession: () => void): void {
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;
  useEffect(() => () => endSessionRef.current(), []);
}
