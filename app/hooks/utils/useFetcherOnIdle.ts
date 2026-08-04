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

  /**
   * @effect Fire onIdle(fetcher.data) exactly once per busy->idle transition of the given fetcher.
   * @effect-deps busy (derived from fetcher.state), fetcher.data (the payload to hand to onIdle);
   *   onIdle itself is intentionally excluded — it's read from onIdleRef so inline closures don't
   *   cause spurious re-fires or need memoizing at call sites
   * @effect-side-effects none directly — invokes the caller's onIdle callback, whose own side effects
   *   (toast, rollback, etc.) are the caller's responsibility
   * @effect-why-not-loader This hook exists specifically to replace ad-hoc effects watching
   *   fetcher.state/fetcher.data (which re-fire on stale/identical data); the edge-detection itself
   *   still requires an effect since it can't run during render.
   */
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (wasBusy && !busy) {
      onIdleRef.current(fetcher.data);
    }
  }, [busy, fetcher.data]);
}
