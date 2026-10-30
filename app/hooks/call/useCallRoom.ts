import { useEffect, useState, useCallback, useRef } from "react";
import { logger } from "@/lib/logger.client";
import { parseWorkspaceEventData, type PredictiveBroadcastPayload } from "@/lib/workspace-events.shared";
import { subscribeToWorkspaceEventSource } from "@/lib/workspace-events-connection.client";
import { acceptPredictiveRoomEvent, currentPredictiveRoom, initialPredictiveRoom } from "@/lib/predictive-customer-state";

const PRESENCE_UPDATE_INTERVAL = 5 * 60 * 1000;

interface PresenceUser {
  id: string;
  [key: string]: unknown;
}

interface UseCallRoomParams {
  workspace: string;
  campaign: number | undefined;
  userId: string;
  conference?: string | null;
}

interface UseCallRoomReturn {
  status: "offline" | "online" | "error";
  users: PresenceUser[];
  predictiveState: PredictiveBroadcastPayload;
  customerCallSid: string | null;
}

/** Campaign room: predictive broadcasts and presence sync via workspace SSE. */
const useCallRoom = ({
  workspace,
  campaign,
  userId,
  conference = null,
}: UseCallRoomParams): UseCallRoomReturn => {
  const [status, setStatus] = useState<"offline" | "online" | "error">("offline");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const owner = { workspace, campaign, userId, conference };
  const [snapshot, setSnapshot] = useState(() => initialPredictiveRoom(owner));
  const current = currentPredictiveRoom(snapshot, owner);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusRef = useRef<"offline" | "online" | "error">("offline");
  const conferenceRef = useRef(conference);

  const updatePresence = useCallback(
    async (newStatus: "online" | "offline") => {
      if (!campaign || !userId || !workspace) return;

      try {
        await fetch("/api/agent-status", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspace,
            status: newStatus === "online" ? "available" : "offline",
            reason: "call_room_presence",
          }),
        });
      } catch (error) {
        logger.error("Error updating presence:", error);
        setStatus("error");
      }
    },
    [workspace, campaign, userId],
  );

  /**
   * @effect Mirror the latest connection status and conference into refs so
   * the heartbeat and SSE handler read current values without resubscribing.
   * @effect-deps status, conference (re-sync the current connection and target)
   * @effect-side-effects none (plain ref assignment, no timer/subscription/DOM)
   * @effect-why-not-loader Not data fetching; this is the "latest ref" pattern for
   * reading current state inside a longer-lived closure (the heartbeat interval below).
   */
  useEffect(() => {
    statusRef.current = status;
    conferenceRef.current = conference;
  }, [status, conference]);

  /**
   * @effect Join this call room via the shared workspace SSE connection: relay
   * predictive-dialer broadcasts and presence_sync events into local state,
   * mark the agent online, and send a periodic presence heartbeat while online.
   * Uses the shared, reference-counted connection (one EventSource per
   * workspace) instead of opening its own — a second EventSource here helped
   * exhaust the browser's HTTP/1.1 connection pool, and the shared connection
   * also handles reconnection and access-revoked teardown centrally.
   * @effect-deps campaign, updatePresence, userId, workspace (identify which
   * workspace/campaign room to join and which agent to report presence for)
   * @effect-side-effects subscription (shared workspace-events registry) + timer
   * (setInterval heartbeat, PRESENCE_UPDATE_INTERVAL) + fetch (updatePresence
   * POSTs on join/heartbeat/unmount); all torn down in the cleanup function.
   * @effect-why-not-loader Requires a persistent live push stream (SSE) and a
   * recurring heartbeat for the lifetime of the mounted call room, not a
   * one-shot request/response.
   */
  useEffect(() => {
    if (!userId || !workspace) return;

    const url = `/api/workspaces/${encodeURIComponent(workspace)}/events`;
    let active = true;

    const onWorkspaceEvent = (message: MessageEvent<string>) => {
      try {
        if (!active) return;
        const record = parseWorkspaceEventData(message.data);
        if (record.workspace_id !== workspace) return;
        if (record.event_type === "predictive_broadcast") {
          setSnapshot(previous => acceptPredictiveRoomEvent(previous,
            { workspace, campaign, userId, conference: conferenceRef.current }, record));
          return;
        }
        if (record.event_type === "presence_sync") {
          const payload = record.payload as { users?: PresenceUser[] };
          setUsers(payload.users ?? []);
        }
      } catch (error) {
        logger.error("Error handling call room SSE event:", error);
      }
    };

    const unsubscribe = subscribeToWorkspaceEventSource(url, onWorkspaceEvent);
    setStatus("online");
    void updatePresence("online");

    presenceIntervalRef.current = setInterval(() => {
      if (statusRef.current === "online") {
        void updatePresence("online");
      }
    }, PRESENCE_UPDATE_INTERVAL);

    return () => {
      active = false;
      unsubscribe();
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }
      if (statusRef.current === "online") {
        void updatePresence("offline");
      }
      setStatus("offline");
    };
  }, [campaign, updatePresence, userId, workspace]);

  return { status, users, predictiveState: current.payload, customerCallSid: current.customerCallSid };
};

export default useCallRoom;
