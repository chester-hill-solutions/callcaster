import { useEffect, useState, useCallback, useRef } from "react";
import { logger } from "@/lib/logger.client";
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

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
          setPredictiveState(record.payload as PredictiveState);
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
