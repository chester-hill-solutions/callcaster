import { Link, useLoaderData, useNavigate, useFetcher, useOutletContext } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff } from "lucide-react";
import { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SoftphonePanel } from "@/components/calls/SoftphonePanel";
import type { HandsetLoaderData } from "@/lib/handset/handset-session.server";
import { useAgentStatus } from "@/hooks/agent/useAgentStatus";
import { useSoftphoneController } from "@/hooks/call/useSoftphoneController";
import { useSoftphoneAudioDevices } from "@/hooks/call/useSoftphoneAudioDevices";
import type { Database } from "@/lib/database.types";

type AgentState = Database["public"]["Enums"]["agent_state"];
type OutletContext = {
  supabase: SupabaseClient<Database>;
  env: { SUPABASE_URL: string; SUPABASE_KEY: string; BASE_URL: string };
};

const STATUS_OPTIONS: { value: AgentState; label: string; color: string }[] = [
  { value: "available", label: "Available", color: "bg-green-500" },
  { value: "away", label: "Away", color: "bg-amber-500" },
  { value: "offline", label: "Offline", color: "bg-gray-400" },
];

const STATUS_REASONS: Record<string, string[]> = {
  away: ["break", "lunch", "meeting", "training", "other"],
  offline: ["ended_shift", "device_issue"],
};

export default function AgentDesktop() {
  const loaderData = useLoaderData<HandsetLoaderData>();
  const { supabase } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const sessionEndedRef = useRef(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const {
    handsetNumber,
    clientIdentity,
    workspaceId,
    token,
    tokenError,
    agentStatus: initialStatus,
    userId,
  } = loaderData;

  const {
    agentStatus,
    setStatus,
    loading: statusLoading,
    error: statusError,
  } = useAgentStatus({
    supabase,
    workspaceId,
    userId,
  });

  const effectiveStatus = agentStatus ?? initialStatus;

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    fetcher.submit(
      { intent: "end_session" },
      { method: "POST", action: `/workspaces/${workspaceId}/handset` },
    );
  }, [fetcher, workspaceId]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  const handleSetStatus = useCallback(
    async (to: AgentState, reason?: string) => {
      if (to === "available") {
        const ok = await runDeviceCheck();
        if (!ok) {
          setRuntimeError(
            "Cannot go Available: microphone access required. Check your browser permissions.",
          );
          return;
        }
      }
      await setStatus(to, reason ?? undefined);
    },
    [setStatus],
  );

  if (!handsetNumber) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Agent Desktop</h1>
          <p className="mt-2 text-muted-foreground">
            No phone number is set up for this workspace. Add a number in
            workspace settings and enable handset mode to receive calls here.
          </p>
          <Button asChild className="mt-4">
            <Link to={`/workspaces/${workspaceId}/settings`}>
              Workspace settings
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (tokenError || runtimeError) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Agent Desktop</h1>
          <StatusBar
            currentStatus={effectiveStatus}
            onSetStatus={handleSetStatus}
            disabled={statusLoading}
            error={tokenError ?? runtimeError ?? undefined}
          />
          <p className="mt-4 text-destructive">{tokenError ?? runtimeError}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/workspaces/${workspaceId}`}>Back to workspace</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Agent Desktop</h1>
          <StatusBar
            currentStatus={effectiveStatus}
            onSetStatus={handleSetStatus}
            disabled={statusLoading}
          />
          <p className="mt-4 text-muted-foreground">Connecting...</p>
        </Card>
      </div>
    );
  }

  return (
    <AgentDesktopConnected
      token={token}
      handsetNumber={handsetNumber}
      clientIdentity={clientIdentity}
      workspaceId={workspaceId}
      effectiveStatus={effectiveStatus}
      onSetStatus={handleSetStatus}
      statusLoading={statusLoading}
      statusError={statusError}
      runtimeError={runtimeError ?? tokenError ?? undefined}
      endSession={endSession}
      onError={setRuntimeError}
      onNavigateBack={() => navigate(`/workspaces/${workspaceId}`)}
    />
  );
}

type AgentDesktopConnectedProps = {
  token: string;
  handsetNumber: string;
  clientIdentity: string;
  workspaceId: string;
  effectiveStatus: HandsetLoaderData["agentStatus"];
  onSetStatus: (to: AgentState, reason?: string) => Promise<void>;
  statusLoading: boolean;
  statusError: string | null;
  runtimeError?: string;
  endSession: () => void;
  onError: (message: string) => void;
  onNavigateBack: () => void;
};

function AgentDesktopConnected({
  token,
  handsetNumber,
  clientIdentity,
  workspaceId,
  effectiveStatus,
  onSetStatus,
  statusLoading,
  statusError,
  runtimeError,
  endSession,
  onError,
  onNavigateBack,
}: AgentDesktopConnectedProps) {
  const isAvailable = effectiveStatus?.status === "available";

  const controller = useSoftphoneController({
    token,
    workspaceId,
    clientIdentity,
    endSession,
    onNavigateBack,
    onError,
  });

  const audio = useSoftphoneAudioDevices({
    device: controller.connection.device,
    activeCall: controller.callHandling.activeCall,
    micCoordinator: {
      isMicMuted: controller.callHandling.isMicMuted,
      setMicMuted: controller.callHandling.setMicMuted,
    },
  });

  const waitingContent = isAvailable ? (
    <p className="mt-6 text-center text-muted-foreground">Waiting for calls...</p>
  ) : (
    <div className="mt-6 flex flex-col items-center gap-2">
      <BellOff className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-muted-foreground">
        You&apos;re currently {effectiveStatus?.status ?? "offline"}
      </p>
      {effectiveStatus?.status !== "offline" && (
        <p className="text-xs text-muted-foreground/60">
          Incoming calls will not ring here while {effectiveStatus?.status}
        </p>
      )}
    </div>
  );

  return (
    <SoftphonePanel
      title="Agent Desktop"
      handsetNumber={handsetNumber}
      handsetNumberLabel="Your desk phone number"
      idPrefix="agent"
      controller={controller}
      audio={audio}
      outboundDialDisabled={!isAvailable}
      waitingContent={waitingContent}
      onEndSession={controller.handleEndSession}
      headerExtra={
        <div className="mt-2">
          <StatusBar
            currentStatus={effectiveStatus}
            onSetStatus={onSetStatus}
            disabled={statusLoading}
            error={runtimeError ?? statusError ?? undefined}
          />
        </div>
      }
    />
  );
}

function StatusBar({
  currentStatus,
  onSetStatus,
  disabled,
  error,
}: {
  currentStatus: HandsetLoaderData["agentStatus"];
  onSetStatus: (to: AgentState, reason?: string) => Promise<void>;
  disabled: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState<string>("");
  const [showReasons, setShowReasons] = useState(false);

  const currentState = currentStatus?.status ?? "offline";

  const handleSetStatus = useCallback(
    async (to: AgentState) => {
      if (to === "away" || to === "offline") {
        setShowReasons(true);
        return;
      }
      await onSetStatus(to);
      setShowReasons(false);
      setReason("");
    },
    [onSetStatus],
  );

  const handleReasonSubmit = useCallback(
    async (selectedReason: string) => {
      const to = showReasons ? "away" : "available";
      await onSetStatus(to === "away" ? "away" : to, selectedReason || undefined);
      setShowReasons(false);
      setReason("");
    },
    [onSetStatus, showReasons],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${
              currentState === "available"
                ? "bg-green-500"
                : currentState === "away"
                  ? "bg-amber-500"
                  : "bg-gray-400"
            }`}
          />
          <span className="text-sm font-medium capitalize">
            {currentState.replace("_", " ")}
          </span>
          {currentStatus?.status_started_at && (
            <span className="text-xs text-muted-foreground">
              since{" "}
              {new Date(currentStatus.status_started_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={currentState === opt.value ? "default" : "outline"}
              size="sm"
              className="text-xs"
              disabled={disabled || currentState === opt.value}
              onClick={() => handleSetStatus(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {showReasons && (
        <div className="flex items-center gap-2 rounded-lg border p-2">
          <Select
            value={reason}
            onValueChange={(v) => {
              setReason(v);
              handleReasonSubmit(v);
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Select a reason..." />
            </SelectTrigger>
            <SelectContent>
              {(STATUS_REASONS[currentState === "available" ? "away" : "offline"] ?? []).map(
                (r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r}
                  </SelectItem>
                ),
              )}
              <SelectItem value="other" className="text-xs">
                Other
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setShowReasons(false);
              onSetStatus("available");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

async function runDeviceCheck(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
