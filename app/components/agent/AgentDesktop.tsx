import { Link, useLoaderData, useNavigate, useFetcher, useOutletContext } from "react-router";
import { useCallback, useRef, useState } from "react";
import { BellOff } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { SoftphonePanel } from "@/components/calls/SoftphonePanel";
import type { HandsetLoaderData } from "@/lib/handset/handset-session.server";
import { useAgentStatus } from "@/hooks/agent/useAgentStatus";
import { useEndSessionOnUnmount } from "@/hooks/handset/useEndSessionOnUnmount";
import { useSoftphoneController } from "@/hooks/call/useSoftphoneController";
import { useSoftphoneAudioDevices } from "@/hooks/call/useSoftphoneAudioDevices";
import type { Database } from "@/lib/db-types";

type AgentState = Database["public"]["Enums"]["agent_state"];
type OutletContext = {
  env: { BASE_URL: string };
};

const STATUS_OPTIONS: { value: AgentState; label: string; color: string }[] = [
  { value: "available", label: "Available", color: "bg-success" },
  { value: "away", label: "Away", color: "bg-warning" },
  { value: "offline", label: "Offline", color: "bg-muted-foreground" },
];

const STATUS_REASONS: Record<"away" | "offline", string[]> = {
  away: ["break", "lunch", "meeting", "training"],
  offline: ["ended_shift", "device_issue"],
};

type ReasonedAgentState = Extract<AgentState, "away" | "offline">;

export default function AgentDesktop() {
  const loaderData = useLoaderData<HandsetLoaderData>();
  useOutletContext<OutletContext>();
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

  useEndSessionOnUnmount(endSession);

  const handleSetStatus = useCallback(
    async (to: AgentState, reason?: string): Promise<boolean> => {
      if (to === "available") {
        const ok = await runDeviceCheck();
        if (!ok) {
          setRuntimeError(
            "Cannot go Available: microphone access required. Check your browser permissions.",
          );
          return false;
        }
      }
      return setStatus(to, reason ?? undefined);
    },
    [setStatus],
  );

  if (!handsetNumber) {
    return (
      <PageShell title="Agent Desktop" maxWidth="narrow">
        <Text variant="muted">
          No phone number is set up for this workspace. Add a number in
          workspace settings and enable handset mode to receive calls here.
        </Text>
        <Button asChild className="w-fit">
          <Link to={`/workspaces/${workspaceId}/settings`}>
            Workspace settings
          </Link>
        </Button>
      </PageShell>
    );
  }

  if (tokenError || runtimeError) {
    return (
      <PageShell title="Agent Desktop" maxWidth="narrow">
        <StatusBar
          currentStatus={effectiveStatus}
          onSetStatus={handleSetStatus}
          disabled={statusLoading}
          error={tokenError ?? runtimeError ?? undefined}
        />
        <Alert variant="destructive">
          <AlertDescription>{tokenError ?? runtimeError}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-fit">
          <Link to={`/workspaces/${workspaceId}`}>Back to workspace</Link>
        </Button>
      </PageShell>
    );
  }

  if (!token) {
    return (
      <PageShell title="Agent Desktop" maxWidth="narrow">
        <StatusBar
          currentStatus={effectiveStatus}
          onSetStatus={handleSetStatus}
          disabled={statusLoading}
        />
        <Text variant="muted">Connecting...</Text>
      </PageShell>
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
  onSetStatus: (to: AgentState, reason?: string) => Promise<boolean>;
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
    <p className="text-center text-muted-foreground">Waiting for calls...</p>
  ) : (
    <div className="flex flex-col items-center gap-2">
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
      outboundDialDisabledReason={
        isAvailable ? undefined : "Set your status to Available to dial out."
      }
      waitingContent={waitingContent}
      onEndSession={controller.handleEndSession}
      headerExtra={
        <StatusBar
          currentStatus={effectiveStatus}
          onSetStatus={onSetStatus}
          disabled={statusLoading}
          error={runtimeError ?? statusError ?? undefined}
        />
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
  onSetStatus: (to: AgentState, reason?: string) => Promise<boolean>;
  disabled: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState<string>("");
  const [pendingStatus, setPendingStatus] = useState<ReasonedAgentState | null>(
    null,
  );

  const currentState = currentStatus?.status ?? "offline";

  const handleSetStatus = useCallback(
    async (to: AgentState) => {
      if (to === "away" || to === "offline") {
        setPendingStatus(to);
        setReason("");
        return;
      }
      const ok = await onSetStatus(to);
      if (ok) {
        setPendingStatus(null);
        setReason("");
      }
    },
    [onSetStatus],
  );

  const handleReasonSubmit = useCallback(
    async (selectedReason: string) => {
      if (!pendingStatus) return;
      const ok = await onSetStatus(pendingStatus, selectedReason || undefined);
      if (ok) {
        setPendingStatus(null);
        setReason("");
      }
    },
    [onSetStatus, pendingStatus],
  );

  const handleCancelReason = useCallback(() => {
    setPendingStatus(null);
    setReason("");
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${
              currentState === "available"
                ? "bg-success"
                : currentState === "away"
                  ? "bg-warning"
                  : "bg-muted-foreground"
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

      {pendingStatus && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
          <Select
            value={reason}
            onValueChange={(v) => {
              setReason(v);
              void handleReasonSubmit(v);
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue
                placeholder={`Select a reason for ${pendingStatus}...`}
              />
            </SelectTrigger>
            <SelectContent>
              {(STATUS_REASONS[pendingStatus] ?? []).map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {r}
                </SelectItem>
              ))}
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
            onClick={handleCancelReason}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
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
