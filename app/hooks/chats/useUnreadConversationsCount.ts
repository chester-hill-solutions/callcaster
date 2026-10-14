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
 * Freshness strategy: fetch on mount, poll every POLL_INTERVAL_MS,
 * and bump the count optimistically (no network call) whenever a realtime
 * inbound message INSERT arrives so the badge reacts immediately. The next
 * scheduled poll reconciles any drift (e.g. messages marked read elsewhere).
 * Successful local reads refresh the total without waiting for that poll.
 */
export function useUnreadConversationsCount(
  workspaceId: string | undefined,
): number {
  const [countState, setCountState] = useState({ workspaceId, count: 0 });
  const inFlightRef = useRef(new Map<string, { refreshAfterRead: boolean }>());
  const currentWorkspaceIdRef = useRef(workspaceId);
  currentWorkspaceIdRef.current = workspaceId;

  const refresh = useCallback(async (afterRead = false) => {
    if (!workspaceId) return;
    const pending = inFlightRef.current.get(workspaceId);
    if (pending) {
      if (afterRead) pending.refreshAfterRead = true;
      return;
    }
    const request = { refreshAfterRead: false };
    inFlightRef.current.set(workspaceId, request);
    try {
      do {
        request.refreshAfterRead = false;
        try {
          const total = await fetchWorkspaceUnreadCount(workspaceId);
          // A read can finish after this count query took its snapshot.
          if (currentWorkspaceIdRef.current === workspaceId && !request.refreshAfterRead) {
            setCountState({ workspaceId, count: total });
          }
        } catch (error) {
          logger.error("Failed to load unread conversation count", error);
        }
      } while (request.refreshAfterRead && currentWorkspaceIdRef.current === workspaceId);
    } finally {
      inFlightRef.current.delete(workspaceId);
    }
  }, [workspaceId]);

  /**
   * @effect Fetch the workspace-wide unread count on mount/workspace change, after successful local reads, and every POLL_INTERVAL_MS.
   * @effect-deps workspaceId (refetch and restart polling when switching workspaces), refresh (useCallback memoized on workspaceId, so identity is stable per workspace)
   * @effect-side-effects fetch + timer + local read-event listeners, removed on unmount/workspace change
   * @effect-why-not-loader This hook backs a persistent nav badge that lives outside any single route's loader lifecycle and must keep refreshing on a timer independent of navigation — a loader only runs once per navigation/revalidation, not periodically. It's deliberately paired with optimistic realtime bumps for immediate feedback that a request/response loader cycle can't provide.
   */
  useEffect(() => {
    if (!workspaceId) return;
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const handleRead = (event: Event) => {
      const { detail } = event as CustomEvent<{ workspaceId?: string }>;
      if (detail?.workspaceId === workspaceId) void refresh(true);
    };
    window.addEventListener("message-read", handleRead);
    window.addEventListener("messages-read", handleRead);
    return () => {
      clearInterval(interval);
      window.removeEventListener("message-read", handleRead);
      window.removeEventListener("messages-read", handleRead);
    };
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
