import { useEffect, useMemo, useRef } from "react";
import { logger } from "@/lib/logger.client";
import { subscribeToWorkspaceEventSource } from "@/lib/workspace-events-connection.client";
import {
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
   * @effect-side-effects subscription — attaches to the shared workspace EventSource on mount/dep-change; detaches on cleanup (the underlying connection closes when its last subscriber leaves)
   * @effect-why-not-loader Live server-pushed row changes can't be modeled as a request/response loader; the connection must stay open for the component's lifetime and react to filter/table changes by resubscribing.
   */
  useEffect(() => {
    if (!workspaceId) return;

    const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/events`;

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

    // One shared EventSource per URL — a per-hook connection multiplied by
    // every subscriber on the page and exhausted the browser's 6-connection
    // HTTP/1.1 pool, hanging all later same-origin fetches (dial submits,
    // route discovery, navigation). Revocation handling lives in the shared
    // connection module.
    return subscribeToWorkspaceEventSource(url, handleWorkspaceEvent);
  }, [workspaceId, tablesForSubscription, filter]);
};
