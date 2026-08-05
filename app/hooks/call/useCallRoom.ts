import { useEffect, useState, useCallback, useRef } from "react";
import { logger } from "@/lib/logger.client";
import { toDialerStatus } from "@/lib/call-status";
import { parseWorkspaceEventData } from "@/lib/workspace-events.shared";

const PRESENCE_UPDATE_INTERVAL = 5 * 60 * 1000;

interface PresenceUser {
  id: string;
  [key: string]: unknown;
}

interface PredictiveState {
  contact_id: number | null;
  status: string;
}

interface UseCallRoomParams {
  workspace: string;
  campaign: number | undefined;
  userId: string;
}

interface UseCallRoomReturn {
  status: "offline" | "online" | "error";
  users: PresenceUser[];
  predictiveState: PredictiveState;
}

/** Campaign room: predictive broadcasts and presence sync via workspace SSE. */
const useCallRoom = ({
  workspace,
  campaign,
  userId,
}: UseCallRoomParams): UseCallRoomReturn => {
  const [status, setStatus] = useState<"offline" | "online" | "error">("offline");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [predictiveState, setPredictiveState] = useState<PredictiveState>({
    contact_id: null,
    status: "idle",
  });
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusRef = useRef<"offline" | "online" | "error">("offline");

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
   * @effect Mirror the latest connection `status` into a ref so the presence
   * heartbeat interval (set up once per SSE connection) can read the current
   * value without needing to be recreated on every status change.
   * @effect-deps status (re-syncs the ref whenever the SSE-driven status changes)
   * @effect-side-effects none (plain ref assignment, no timer/subscription/DOM)
   * @effect-why-not-loader Not data fetching; this is the "latest ref" pattern for
   * reading current state inside a longer-lived closure (the heartbeat interval below).
   */
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /**
   * @effect Open a workspace SSE connection for this call room: track presence
   * online/offline, relay predictive-dialer broadcasts and presence_sync events
   * into local state, and send a periodic presence heartbeat while online.
   * @effect-deps campaign, updatePresence, userId, workspace (all identify which
   * workspace/campaign room to connect to and are needed to (re)open the stream
   * and to report presence for the right agent/campaign)
   * @effect-side-effects subscription (EventSource + "workspace_event" listener) +
   * timer (setInterval heartbeat, PRESENCE_UPDATE_INTERVAL) + fetch (updatePresence
   * POSTs on open/heartbeat/unmount); all torn down in the cleanup function.
   * @effect-why-not-loader Requires a persistent live connection (SSE) and a
   * recurring heartbeat for the lifetime of the mounted call room; this is a
   * subscription to a push stream, not a one-shot request/response.
   */
  useEffect(() => {
    if (!userId || !workspace) return;

    const url = `/api/workspaces/${encodeURIComponent(workspace)}/events`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setStatus("online");
      void updatePresence("online");
    };

    const onWorkspaceEvent = (message: MessageEvent<string>) => {
      try {
        const record = parseWorkspaceEventData(message.data);
        if (record.event_type === "predictive_broadcast") {
          const payload = record.payload as unknown as PredictiveState;
          // Broadcasts carry raw Twilio statuses (see runCallStatusSideEffects);
          // translate them to the dialer vocabulary the consumers switch on.
          setPredictiveState({
            contact_id: payload.contact_id ?? null,
            status: toDialerStatus(String(payload.status ?? "")),
          });
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

    eventSource.addEventListener("workspace_event", onWorkspaceEvent);
    eventSource.onerror = () => {
      setStatus("error");
    };

    presenceIntervalRef.current = setInterval(() => {
      if (statusRef.current === "online") {
        void updatePresence("online");
      }
    }, PRESENCE_UPDATE_INTERVAL);

    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }
      eventSource.removeEventListener("workspace_event", onWorkspaceEvent);
      eventSource.close();
      if (statusRef.current === "online") {
        void updatePresence("offline");
      }
      setStatus("offline");
    };
  }, [campaign, updatePresence, userId, workspace]);

  return { status, users, predictiveState };
};

export default useCallRoom;
