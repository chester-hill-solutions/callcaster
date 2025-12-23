import { useEffect, useRef, useState, useCallback } from 'react';

export interface UseIntersectionObserverOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  freezeOnceVisible?: boolean;
}

export interface IntersectionObserverEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  intersectionRect: DOMRectReadOnly;
  boundingClientRect: DOMRectReadOnly;
  rootBounds: DOMRectReadOnly | null;
  target: Element;
  time: number;
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): [
  (node: Element | null) => void,
  IntersectionObserverEntry | null
] {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
    freezeOnceVisible = false,
  } = options;

  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [node, setNode] = useState<Element | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  const setRef = useCallback(
    (newNode: Element | null) => {
      // Disconnect previous observer
      disconnect();

      // Update node
      setNode(newNode);

      if (newNode) {
        const observer = new IntersectionObserver(
          ([intersectionEntry]) => {
            setEntry(intersectionEntry);

            // Freeze once visible if option is enabled
            if (freezeOnceVisible && intersectionEntry.isIntersecting) {
              disconnect();
            }
          },
          {
            root,
            rootMargin,
            threshold,
          }
        );

        observer.observe(newNode);
        observerRef.current = observer;
      }
    },
    [root, rootMargin, threshold, freezeOnceVisible, disconnect]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return [setRef, entry];
}

// Hook for observing multiple elements
export function useIntersectionObserverMulti(
  options: UseIntersectionObserverOptions = {}
): {
  observe: (node: Element | null, id: string) => void;
  unobserve: (id: string) => void;
  entries: Record<string, IntersectionObserverEntry>;
  isIntersecting: (id: string) => boolean;
} {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
  } = options;

  const [entries, setEntries] = useState<Record<string, IntersectionObserverEntry>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeMapRef = useRef<Map<string, Element>>(new Map());

  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  const observe = useCallback(
    (node: Element | null, id: string) => {
      if (!node) {
        // Remove node from map
        nodeMapRef.current.delete(id);
        setEntries(prev => {
          const newEntries = { ...prev };
          delete newEntries[id];
          return newEntries;
        });
        return;
      }

      // Add node to map
      nodeMapRef.current.set(id, node);

      // Create observer if it doesn't exist
      if (!observerRef.current) {
        observerRef.current = new IntersectionObserver(
          (intersectionEntries) => {
            setEntries(prev => {
              const newEntries = { ...prev };
              intersectionEntries.forEach(entry => {
                // Find the id for this entry
                for (const [id, node] of nodeMapRef.current.entries()) {
                  if (node === entry.target) {
                    newEntries[id] = entry;
                    break;
                  }
                }
              });
              return newEntries;
            });
          },
          {
            root,
            rootMargin,
            threshold,
          }
        );
      }

      // Observe the node
      observerRef.current.observe(node);
    },
    [root, rootMargin, threshold]
  );

  const unobserve = useCallback(
    (id: string) => {
      const node = nodeMapRef.current.get(id);
      if (node && observerRef.current) {
        observerRef.current.unobserve(node);
        nodeMapRef.current.delete(id);
        setEntries(prev => {
          const newEntries = { ...prev };
          delete newEntries[id];
          return newEntries;
        });
      }
    },
    []
  );

  const isIntersecting = useCallback(
    (id: string) => {
      return entries[id]?.isIntersecting ?? false;
    },
    [entries]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    observe,
    unobserve,
    entries,
    isIntersecting,
  };
}

// Hook for infinite scrolling
export function useInfiniteScroll(
  options: UseIntersectionObserverOptions & {
    onLoadMore: () => void | Promise<void>;
    hasMore: boolean;
    loading?: boolean;
  }
): [(node: Element | null) => void, boolean] {
  const { onLoadMore, hasMore, loading = false, ...observerOptions } = options;
  const [ref, entry] = useIntersectionObserver({
    ...observerOptions,
    threshold: 0.1,
  });

  useEffect(() => {
    if (entry?.isIntersecting && hasMore && !loading) {
      onLoadMore();
    }
  }, [entry?.isIntersecting, hasMore, loading, onLoadMore]);

  return [ref, entry?.isIntersecting ?? false];
}

// Hook for lazy loading images
export function useLazyImage(
  src: string,
  options: UseIntersectionObserverOptions & {
    placeholder?: string;
    onLoad?: () => void;
    onError?: (error: Error) => void;
  } = {}
): {
  ref: (node: Element | null) => void;
  src: string;
  loading: boolean;
  error: Error | null;
} {
  const { placeholder, onLoad, onError, ...observerOptions } = options;
  const [currentSrc, setCurrentSrc] = useState(placeholder || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [ref, entry] = useIntersectionObserver(observerOptions);

  useEffect(() => {
    if (entry?.isIntersecting && currentSrc !== src) {
      setLoading(true);
      setError(null);

      const img = new Image();
      img.onload = () => {
        setCurrentSrc(src);
        setLoading(false);
        onLoad?.();
      };
      img.onerror = () => {
        const err = new Error(`Failed to load image: ${src}`);
        setError(err);
        setLoading(false);
        onError?.(err);
      };
      img.src = src;
    }
  }, [entry?.isIntersecting, src, currentSrc, onLoad, onError]);

  return {
    ref,
    src: currentSrc,
    loading,
    error,
  };
} 