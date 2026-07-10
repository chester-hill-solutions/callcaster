import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

type FlashParamHandler = (value: string) => void;

/**
 * One-shot side effects driven by URL search params (e.g. toasts after a
 * redirect that appended `?skipped=...`), then strips those params from the
 * URL with a replace navigation. Each handler receives the param's value and
 * runs once per appearance. This must stay an effect: the handlers fire
 * toasts/navigation, which cannot run during render.
 */
export function useSearchParamFlash(
  handlers: Record<string, FlashParamHandler>,
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const presentKeys = Object.keys(handlersRef.current).filter(
      (key) => searchParams.get(key) != null,
    );
    if (presentKeys.length === 0) {
      return;
    }
    for (const key of presentKeys) {
      const value = searchParams.get(key);
      const handler = handlersRef.current[key];
      if (handler && value != null) {
        handler(value);
      }
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of presentKeys) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);
}
