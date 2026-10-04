import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkspaceUnreadCount } from "@/lib/chats/messaging-client";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import { isInboundMessageDirection } from "@/lib/chat-conversation-sort";
import type { RealtimeChangePayload } from "@/lib/workspace-events.shared";
import type { Tables } from "@/lib/db-types";
import { logger } from "@/lib/logger.client";

const POLL_INTERVAL_MS = 30_000;

/**
 * Tracks a workspace-wide unread conversation count for nav badges.
 *
 * Freshness strategy: fetch on mount, refetch at most every POLL_INTERVAL_MS,
 * and bump the count optimistically (no network call) whenever a realtime
 * inbound message INSERT arrives so the badge reacts immediately. The next
 * scheduled poll reconciles any drift (e.g. messages marked read elsewhere).
 */
export function useUnreadConversationsCount(
  workspaceId: string | undefined,
): number {
  const [countState, setCountState] = useState({ workspaceId, count: 0 });
  const inFlightRef = useRef(new Set<string>());
  const currentWorkspaceIdRef = useRef(workspaceId);
  currentWorkspaceIdRef.current = workspaceId;

  const refresh = useCallback(async () => {
    if (!workspaceId || inFlightRef.current.has(workspaceId)) return;
    inFlightRef.current.add(workspaceId);
    try {
      const total = await fetchWorkspaceUnreadCount(workspaceId);
      // A late response for a previous workspace must not clobber the
      // count for the workspace we've since switched to.
      if (currentWorkspaceIdRef.current === workspaceId) {
        setCountState({ workspaceId, count: total });
      }
    } catch (error) {
      logger.error("Failed to load unread conversation count", error);
    } finally {
      inFlightRef.current.delete(workspaceId);
    }
  }, [workspaceId]);

  /**
   * @effect Fetch the workspace-wide unread count on mount/workspace change, then keep it fresh by polling every POLL_INTERVAL_MS (realtime INSERTs bump it optimistically between polls; see useWorkspaceEventSubscription below).
   * @effect-deps workspaceId (refetch and restart polling when switching workspaces), refresh (useCallback memoized on workspaceId, so identity is stable per workspace)
   * @effect-side-effects fetch (initial refresh() call via fetchWorkspaceUnreadCount) + timer (setInterval, cleared on unmount/workspaceId change)
   * @effect-why-not-loader This hook backs a persistent nav badge that lives outside any single route's loader lifecycle and must keep refreshing on a timer independent of navigation — a loader only runs once per navigation/revalidation, not periodically. It's deliberately paired with optimistic realtime bumps for immediate feedback that a request/response loader cycle can't provide.
   */
  useEffect(() => {
    if (!workspaceId) return;
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [workspaceId, refresh]);

  useWorkspaceEventSubscription({
    workspaceId: workspaceId ?? "",
    table: "message",
    filter: workspaceId ? `workspace=eq.${workspaceId}` : undefined,
    onChange: (payload) => {
      if (currentWorkspaceIdRef.current !== workspaceId) return;
      const typedPayload = payload as RealtimeChangePayload<
        Tables<"message">
      >;
      if (typedPayload.eventType !== "INSERT") return;
      const nextRow = typedPayload.new as Tables<"message"> | null;
      if (!nextRow || !isInboundMessageDirection(nextRow.direction)) return;
      setCountState((current) => ({
        workspaceId,
        count: (current.workspaceId === workspaceId ? current.count : 0) + 1,
      }));
    },
  });

  return countState.workspaceId === workspaceId ? countState.count : 0;
}
