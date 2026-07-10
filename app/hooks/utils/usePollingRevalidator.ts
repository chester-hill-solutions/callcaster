import { useRevalidator } from "react-router";
import { useInterval } from "./useInterval";

/**
 * Revalidates the current route's loaders on an interval while `shouldPoll`
 * is true. Skips a tick if a revalidation is already in flight.
 *
 * Use for pending-job screens (exports, imports) that need to refresh until
 * the server reports completion.
 */
export function usePollingRevalidator(
  shouldPoll: boolean,
  intervalMs: number,
): void {
  const revalidator = useRevalidator();
  useInterval(
    () => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    },
    shouldPoll ? intervalMs : null,
  );
}
