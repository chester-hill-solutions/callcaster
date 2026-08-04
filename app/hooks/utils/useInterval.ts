import { useEffect, useRef } from 'react';

/**
 * Hook that sets up an interval that calls a callback function
 * 
 * The interval is automatically cleaned up when the component unmounts
 * or when the delay changes. Set delay to `null` to pause the interval.
 * 
 * @param callback - Function to call on each interval
 * @param delay - Delay in milliseconds between calls, or `null` to pause
 * 
 * @example
 * ```tsx
 * // Run every second
 * useInterval(() => {
 *   console.log('Tick');
 * }, 1000);
 * 
 * // Pause the interval
 * useInterval(() => {
 *   console.log('This won't run');
 * }, null);
 * ```
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<(() => void) | undefined>(undefined);

  /**
   * @effect Keep savedCallback current so the running interval always invokes the latest callback.
   * @effect-deps callback (re-syncs the ref whenever a new callback identity is passed in)
   * @effect-side-effects none — mutates a ref only
   * @effect-why-not-loader Not data fetching — this is the "latest ref" pattern so the interval
   *   effect below doesn't need `callback` in its own deps (which would otherwise reset the timer
   *   on every callback identity change).
   */
  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  /**
   * @effect Start a setInterval(tick, delay) and clear it on unmount or when delay changes; delay=null pauses.
   * @effect-deps delay (only re-arms the timer when the interval period changes/pauses)
   * @effect-side-effects timer (setInterval; cleared via clearInterval on cleanup)
   * @effect-why-not-loader Not data fetching — this is a generic recurring-timer primitive; callers
   *   decide what `callback` does (which may or may not touch data).
   */
  // Set up the interval
  useEffect(() => {
    function tick() {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }

    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }

    return undefined;
  }, [delay]);
} 