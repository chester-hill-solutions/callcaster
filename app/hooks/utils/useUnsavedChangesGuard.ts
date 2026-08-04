import { useEffect } from "react";
import { useBlocker } from "react-router";

/**
 * Blocks in-app navigation (via React Router's data-router `useBlocker`) and
 * warns on tab close/refresh while `isChanged` is true. Confirmation uses a
 * plain `window.confirm` so this stays a drop-in guard usable from any
 * route without pulling in a dialog component.
 */
export function useUnsavedChangesGuard(isChanged: boolean): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isChanged && currentLocation.pathname !== nextLocation.pathname,
  );

  /**
   * @effect Ask the user to confirm in-app navigation via window.confirm when the blocker trips, then proceed/reset.
   * @effect-deps blocker (React Router's useBlocker result; re-runs whenever its state/proceed/reset change)
   * @effect-side-effects dom (window.confirm — a blocking UI prompt) + navigation (blocker.proceed()/reset())
   * @effect-why-not-loader Not data fetching — reacts to React Router's blocker state to show an
   *   imperative confirm dialog, which cannot run during render.
   */
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const shouldLeave = window.confirm(
      "You have unsaved changes. Leave without saving?",
    );
    if (shouldLeave) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  /**
   * @effect Warn on tab close/refresh via beforeunload while there are unsaved changes.
   * @effect-deps isChanged (only subscribes while there's something to lose)
   * @effect-side-effects dom (window 'beforeunload' listener; removed on cleanup/when isChanged flips)
   * @effect-why-not-loader Not data fetching — beforeunload is a browser-native tab-close guard that
   *   only an effect can register/unregister.
   */
  useEffect(() => {
    if (!isChanged) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isChanged]);
}
