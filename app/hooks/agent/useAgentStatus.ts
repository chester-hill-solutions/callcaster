import { useState, useEffect, useCallback, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database, Tables } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";

type AgentState = Database["public"]["Enums"]["agent_state"];

interface UseAgentStatusOptions {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  userId: string;
}

interface UseAgentStatusReturn {
  agentStatus: Tables<"agent_status"> | null;
  setStatus: (to: AgentState, reason?: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  loading: boolean;
  error: string | null;
  onlineAgents: Tables<"agent_status">[];
}

export function useAgentStatus({
  supabase,
  workspaceId,
  userId,
}: UseAgentStatusOptions): UseAgentStatusReturn {
  const [agentStatus, setAgentStatus] = useState<Tables<"agent_status"> | null>(null);
  const [onlineAgents, setOnlineAgents] = useState<Tables<"agent_status">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<SupabaseClient<Database>["channel"]> | null>(null);
  const currentStatusRef = useRef<string>("offline");

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agent-status?workspace_id=${workspaceId}`,
      );
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to fetch status");
        return;
      }
      const { status } = await res.json();
      setAgentStatus(status);
      if (status?.status) {
        currentStatusRef.current = status.status;
      }
    } catch (e) {
      logger.error("Failed to fetch agent status:", e);
      setError("Failed to fetch agent status");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const setStatus = useCallback(
    async (to: AgentState, reason?: string) => {
      try {
        const res = await fetch("/api/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: workspaceId, status: to, reason }),
        });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Failed to update status");
          return;
        }
        const result = await res.json();
        setAgentStatus(result.status);
        currentStatusRef.current = result.status?.status ?? "offline";
      } catch (e) {
        logger.error("Failed to update agent status:", e);
        setError("Failed to update agent status");
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!workspaceId || !userId) return;
    refreshStatus();

    const channel = supabase.channel(`agent-status:${workspaceId}`);
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_status",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as Tables<"agent_status"> | null;
          if (row?.user_id === userId) {
            setAgentStatus(row);
            currentStatusRef.current = row.status;
          }
        },
      )
      .subscribe();

    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch("/api/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            status: currentStatusRef.current,
          }),
        });
      } catch {
        // silent heartbeat
      }
    }, 30_000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [workspaceId, userId, supabase, refreshStatus]);

  return {
    agentStatus,
    setStatus,
    refreshStatus,
    loading,
    error,
    onlineAgents,
  };
}
