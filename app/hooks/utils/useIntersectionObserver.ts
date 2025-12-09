import { useEffect, useRef, useCallback } from 'react';

type IntersectionCallback = (target: HTMLElement) => void;

interface UseIntersectionObserverOptions {
  /**
   * Threshold for intersection (0.0 to 1.0)
   * @default 0.5
   */
  threshold?: number | number[];
  /**
   * Root margin for intersection calculation
   * @default '0px'
   */
  rootMargin?: string;
  /**
   * Root element for intersection calculation
   * @default null (viewport)
   */
  root?: Element | null;
}

interface UseIntersectionObserverReturn {
  /**
   * The IntersectionObserver instance
   */
  observer: IntersectionObserver | null;
  /**
   * Function to observe an element
   */
  observe: (element: Element) => void;
  /**
   * Function to unobserve an element
   */
  unobserve: (element: Element) => void;
  /**
   * Function to disconnect the observer
   */
  disconnect: () => void;
}

/**
 * Hook for observing element intersections with the viewport
 * 
 * @param callback - Function called when an observed element intersects
 * @param options - Configuration options for the IntersectionObserver
 * @returns Object containing observer instance and helper functions
 * 
 * @example
 * ```tsx
 * const { observe, unobserve } = useIntersectionObserver((element) => {
 *   console.log('Element intersected:', element);
 * }, { threshold: 0.5 });
 * 
 * useEffect(() => {
 *   const element = document.querySelector('.my-element');
 *   if (element) {
 *     observe(element);
 *     return () => unobserve(element);
 *   }
 * }, [observe, unobserve]);
 * ```
 */
export function useIntersectionObserver(
  callback: IntersectionCallback,
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn {
  const {
    threshold = 0.5,
    rootMargin = '0px',
    root = null,
  } = options;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callbackRef.current(entry.target as HTMLElement);
          }
        });
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [threshold, rootMargin, root]);

  const observe = useCallback((element: Element) => {
    if (observerRef.current && element) {
      observerRef.current.observe(element);
    }
  }, []);

  const unobserve = useCallback((element: Element) => {
    if (observerRef.current && element) {
      observerRef.current.unobserve(element);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
  }, []);

  return {
    observer: observerRef.current,
    observe,
    unobserve,
    disconnect,
  };
}

