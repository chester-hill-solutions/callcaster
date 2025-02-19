import { useEffect, useRef } from 'react';

type IntersectionCallback = (target: HTMLElement) => void;

export function useIntersectionObserver(callback: IntersectionCallback): IntersectionObserver | null {
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry.target as HTMLElement);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [callback]);

  return observer.current;
}