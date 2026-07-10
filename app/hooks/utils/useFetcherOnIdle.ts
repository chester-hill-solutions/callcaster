import { useEffect, useRef } from "react";
import type { FetcherWithComponents } from "react-router";

/**
 * Calls `onIdle` once each time the fetcher transitions from busy
 * (submitting/loading) back to idle, passing the fetcher's data.
 *
 * Use this instead of a component `useEffect` watching `fetcher.state` or
 * `fetcher.data` — data-identity effects re-fire on stale data and miss
 * back-to-back submissions of identical payloads; the busy→idle edge fires
 * exactly once per completed submission.
 *
 * The callback is kept in a ref, so inline closures are safe and never stale.
 */
export function useFetcherOnIdle<T>(
  fetcher: FetcherWithComponents<T>,
  onIdle: (data: T | undefined) => void,
): void {
  const busy = fetcher.state === "submitting" || fetcher.state === "loading";
  const wasBusyRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (wasBusy && !busy) {
      onIdleRef.current(fetcher.data);
    }
  }, [busy, fetcher.data]);
}
