import { useCallback, useRef } from 'react';

/**
 * Hook that debounces a callback function
 * 
 * Returns a debounced version of the callback that will only execute
 * after the specified delay has passed since the last invocation.
 * 
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds before the callback is executed
 * @returns Debounced version of the callback function
 * 
 * @example
 * ```tsx
 * const debouncedSearch = useDebounce((query: string) => {
 *   console.log('Searching for:', query);
 * }, 300);
 * 
 * // Calling debouncedSearch multiple times quickly will only
 * // execute the callback once after 300ms of inactivity
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // Only this will execute after 300ms
 * ```
 */
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;

  return debouncedCallback;
} 