import { useEffect, useMemo, useRef } from "react";
import { logger } from "@/lib/logger.client";
import {
  ACCESS_REVOKED_EVENT,
  matchesPostgresChangeFilter,
  parseWorkspaceEventData,
  type PostgresChangePayload,
  type RealtimeChangePayload,
} from "@/lib/workspace-events.shared";

/**
 * Subscribe to workspace postgres_change events via SSE.
 */
export const useWorkspaceEventSubscription = ({
  workspaceId,
  table,
  filter,
  onChange,
}: {
  workspaceId: string;
  table?: string | string[];
  filter?: string;
  onChange: (payload: RealtimeChangePayload) => void;
}) => {
  const onChangeRef = useRef(onChange);

  /**
   * @effect Keep a ref to the latest onChange callback so the SSE listener always invokes the current handler without needing to re-subscribe when it changes identity.
   * @effect-deps onChange (caller-supplied callback; may get a new function identity on every render)
   * @effect-side-effects none — updates onChangeRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure in the SSE listener; not data fetching.
   */
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const tableSignature = table
    ? Array.isArray(table)
      ? [...table].sort().join("\0")
      : table
    : "";

  const tablesForSubscription = useMemo(
    () => (table ? (Array.isArray(table) ? [...table] : [table]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tableSignature` is the intentional stable proxy for `table`'s content (sorted/joined string). Depending on `table` directly would defeat the memoization: callers may pass a new array literal each render, and a new `tablesForSubscription` reference would re-trigger the SSE effect below on every render even when the actual table list is unchanged.
    [tableSignature],
  );

  /**
   * @effect Open an SSE connection to the workspace events endpoint and dispatch matching postgres_change events to the caller's onChange handler.
   * @effect-deps workspaceId (which workspace's event stream to open); tablesForSubscription (memoized table-name filter, stable unless the table list's content changes); filter (postgres row filter string, e.g. `workspace=eq.<id>`)
   * @effect-side-effects subscription — opens an EventSource (SSE) connection on mount/dep-change; removes the listener and closes the connection on cleanup
   * @effect-why-not-loader Live server-pushed row changes can't be modeled as a request/response loader; the connection must stay open for the component's lifetime and react to filter/table changes by resubscribing.
   */
  useEffect(() => {
    if (!workspaceId) return;

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/events`;
    const eventSource = new EventSource(url);

    const handleWorkspaceEvent = (message: MessageEvent<string>) => {
      try {
        const record = parseWorkspaceEventData(message.data);
        if (record.event_type !== "postgres_change") return;

        const payload = record.payload as PostgresChangePayload;
        if (tablesForSubscription && !tablesForSubscription.includes(payload.table)) {
          return;
        }
        if (!matchesPostgresChangeFilter(payload, filter)) return;

        onChangeRef.current(payload as RealtimeChangePayload);
      } catch (error) {
        logger.error("Failed to handle workspace SSE event", error);
      }
    };

    // The server sends this when the user's workspace access is revoked while
    // the stream is open. Close explicitly: EventSource reconnects on its own
    // after a server-side close, and every retry would be rejected by the
    // middleware, so without this the tab retries forever.
    const handleAccessRevoked = () => {
      logger.warn("Workspace access revoked; closing SSE subscription");
      eventSource.close();
    };

    eventSource.addEventListener("workspace_event", handleWorkspaceEvent);
    eventSource.addEventListener(ACCESS_REVOKED_EVENT, handleAccessRevoked);
    eventSource.onerror = () => {
      logger.debug("Workspace SSE connection interrupted; EventSource will retry");
    };

    return () => {
      eventSource.removeEventListener("workspace_event", handleWorkspaceEvent);
      eventSource.removeEventListener(ACCESS_REVOKED_EVENT, handleAccessRevoked);
      eventSource.close();
    };
  }, [workspaceId, tablesForSubscription, filter]);
};
