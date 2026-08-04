import { useCallback, useEffect, useRef, useState } from "react";
import { fetchConversationSummaries } from "@/lib/chats/messaging-client";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";
import { isInboundMessageDirection } from "@/lib/chat-conversation-sort";
import type { RealtimeChangePayload } from "@/lib/workspace-events.shared";
import type { Tables } from "@/lib/db-types";
import { logger } from "@/lib/logger.client";
import {
  sumUnreadConversationCount,
  UNREAD_CONVERSATION_PAGE_SIZE,
} from "@/lib/chats/unread-count";

const POLL_INTERVAL_MS = 30_000;

// The conversations endpoint (GET /api/workspaces/:workspaceId/conversations)
// doesn't expose a cheap aggregate "total unread" count -- only per-conversation
// unread_count on each row of a paginated list. To approximate a workspace-wide
// unread total without adding a new server field/endpoint, we fetch the single
// largest page the server allows (page_size=100, see parsePagination's
// maxPageSize in app/lib/pagination.server.ts) and sum unread_count client-side.
// Workspaces with more than 100 distinct conversations will undercount unread
// messages sitting in conversations beyond the first page.
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
  const [unreadCount, setUnreadCount] = useState(0);
  const inFlightRef = useRef(false);
  const currentWorkspaceIdRef = useRef(workspaceId);
  currentWorkspaceIdRef.current = workspaceId;

  const refresh = useCallback(async () => {
    if (!workspaceId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const params = new URLSearchParams({
        page_size: String(UNREAD_CONVERSATION_PAGE_SIZE),
      });
      const conversations = await fetchConversationSummaries(
        workspaceId,
        params,
      );
      const total = sumUnreadConversationCount(conversations);
      // A late response for a previous workspace must not clobber the
      // count for the workspace we've since switched to.
      if (currentWorkspaceIdRef.current === workspaceId) {
        setUnreadCount(total);
      }
    } catch (error) {
      logger.error("Failed to load unread conversation count", error);
    } finally {
      inFlightRef.current = false;
    }
  }, [workspaceId]);

  /**
   * @effect Fetch the workspace-wide unread count on mount/workspace change, then keep it fresh by polling every POLL_INTERVAL_MS (realtime INSERTs bump it optimistically between polls; see useWorkspaceEventSubscription below).
   * @effect-deps workspaceId (refetch and restart polling when switching workspaces), refresh (useCallback memoized on workspaceId, so identity is stable per workspace)
   * @effect-side-effects fetch (initial refresh() call via fetchConversationSummaries) + timer (setInterval, cleared on unmount/workspaceId change)
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
      const typedPayload = payload as RealtimeChangePayload<
        Tables<"message">
      >;
      if (typedPayload.eventType !== "INSERT") return;
      const nextRow = typedPayload.new as Tables<"message"> | null;
      if (!nextRow || !isInboundMessageDirection(nextRow.direction)) return;
      setUnreadCount((current) => current + 1);
    },
  });

  return unreadCount;
}
