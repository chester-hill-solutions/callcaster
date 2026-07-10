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
