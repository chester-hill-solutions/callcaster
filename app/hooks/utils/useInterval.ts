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
  const savedCallback = useRef<() => void>();

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

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
  }, [delay]);
} 