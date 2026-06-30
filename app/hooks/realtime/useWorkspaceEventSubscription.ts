import { useEffect, useMemo, useRef } from "react";
import { logger } from "@/lib/logger.client";
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
    [tableSignature],
  );

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

    eventSource.addEventListener("workspace_event", handleWorkspaceEvent);
    eventSource.onerror = () => {
      logger.debug("Workspace SSE connection interrupted; EventSource will retry");
    };

    return () => {
      eventSource.removeEventListener("workspace_event", handleWorkspaceEvent);
      eventSource.close();
    };
  }, [workspaceId, tablesForSubscription, filter]);
};
