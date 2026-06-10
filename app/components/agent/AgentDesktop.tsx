import { Link, useLoaderData, useNavigate, useFetcher, useOutletContext } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Call } from "@twilio/voice-sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  ArrowLeftRight,
  BellOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import {
  declineIncomingCall,
  IncomingCallPanel,
} from "@/components/calls/IncomingCallPanel";
import type { HandsetLoaderData } from "@/lib/handset/handset-session.server";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { useAgentStatus } from "@/hooks/agent/useAgentStatus";
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
  const isAvailable = effectiveStatus?.status === "available";

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
  const [incomingCallState, setIncomingCallState] = useState<Call | null>(null);
  const noop = useCallback(() => {}, []);
  const deviceOptions = useMemo(() => ({ allowIncomingWhileBusy: true }), []);

  const handleIncomingCall = useCallback(
    (call: Call) => setIncomingCallState(call),
    [],
  );
  const handleConnectionError = useCallback(
    (err: Error) => onError(err.message),
    [onError],
  );

  const connection = useTwilioConnection({
    token,
    deviceOptions,
    onIncomingCall: handleIncomingCall,
    onStatusChange: noop,
    onError: handleConnectionError,
    onDeviceBusyChange: noop,
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    incomingCall: incomingCallState,
    onStatusChange: noop,
    onError: (err) => onError(err.message),
    onDeviceBusyChange: noop,
  });

  const incomingCall = callHandling.incomingCall;
  const isAvailable = effectiveStatus?.status === "available";

  const handleDecline = useCallback(() => {
    declineIncomingCall(callHandling.incomingCall);
    setIncomingCallState(null);
  }, [callHandling.incomingCall]);

  const handleEndSession = useCallback(async () => {
    try {
      for (const held of callHandling.heldCalls) {
        await callHandling.hangUp(held);
      }
      if (callHandling.activeCall) {
        await callHandling.hangUp();
      }
    } catch {
      connection.device?.disconnectAll();
    }
    endSession();
    onNavigateBack();
  }, [
    callHandling.activeCall,
    callHandling.heldCalls,
    callHandling.hangUp,
    connection.device,
    endSession,
    onNavigateBack,
  ]);

  const activeCallRef = useRef(callHandling.activeCall);
  const hangUpRef = useRef(callHandling.hangUp);
  const deviceRef = useRef(connection.device);
  activeCallRef.current = callHandling.activeCall;
  hangUpRef.current = callHandling.hangUp;
  deviceRef.current = connection.device;

  useEffect(() => {
    return () => {
      if (activeCallRef.current) {
        hangUpRef.current?.().catch(() => {});
      }
      deviceRef.current?.disconnectAll();
    };
  }, []);

  const handleKeypadPress = useCallback(
    (key: string) => {
      callHandling.activeCall?.sendDigits(key);
    },
    [callHandling.activeCall],
  );

  const keypadKeys = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#",
  ];

  const [outboundTo, setOutboundTo] = useState("");
  const [outboundError, setOutboundError] = useState<string | null>(null);

  const handleOutboundDial = useCallback(() => {
    const raw = outboundTo.trim();
    if (!raw) {
      setOutboundError("Enter a phone number");
      return;
    }
    setOutboundError(null);
    try {
      const to = normalizePhoneNumber(raw);
      callHandling.makeCall({
        To: to,
        workspace_id: workspaceId,
        client_identity: clientIdentity,
      });
    } catch {
      setOutboundError("Invalid phone number");
      onError("Invalid phone number");
    }
  }, [outboundTo, workspaceId, clientIdentity, callHandling, onError]);

  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [callOnHold, setCallOnHold] = useState(false);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
      if (
        selectedMicId === "" &&
        devices.some((d) => d.kind === "audioinput")
      ) {
        const first = devices.find((d) => d.kind === "audioinput");
        if (first?.deviceId) setSelectedMicId(first.deviceId);
      }
      if (
        selectedSpeakerId === "" &&
        devices.some((d) => d.kind === "audiooutput")
      ) {
        const first = devices.find((d) => d.kind === "audiooutput");
        if (first?.deviceId) setSelectedSpeakerId(first.deviceId);
      }
    } catch {
      setMicrophones([]);
      setSpeakers([]);
    }
  }, [selectedMicId, selectedSpeakerId]);

  const permissionRequestedRef = useRef(false);
  useEffect(() => {
    refreshDevices();
    if (
      !permissionRequestedRef.current &&
      typeof navigator?.mediaDevices?.getUserMedia === "function"
    ) {
      permissionRequestedRef.current = true;
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          refreshDevices();
        })
        .catch(() => {});
    }
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  const device = connection.device;
  const activeCall = callHandling.activeCall;

  useEffect(() => {
    setCallOnHold(false);
  }, [activeCall]);

  useEffect(() => {
    if (!activeCall || !device?.audio) return;
    if (selectedMicId)
      device.audio.setInputDevice(selectedMicId).catch(() => {});
    if (selectedSpeakerId)
      device.audio.speakerDevices?.set(selectedSpeakerId).catch(() => {});
  }, [activeCall, device, selectedMicId, selectedSpeakerId]);

  const handleMicChange = useCallback(
    (deviceId: string) => {
      setSelectedMicId(deviceId);
      if (!device?.audio) return;
      device.audio
        .setInputDevice(deviceId)
        .then(() => {
          setMicMuted(false);
          if (
            activeCall &&
            typeof (
              activeCall as {
                _setInputTracksFromStream?: (s: MediaStream) => Promise<void>;
              }
            )._setInputTracksFromStream === "function"
          ) {
            navigator.mediaDevices
              .getUserMedia({ audio: { deviceId } })
              .then((stream) => {
                (
                  activeCall as {
                    _setInputTracksFromStream: (
                      s: MediaStream,
                    ) => Promise<void>;
                  }
                )._setInputTracksFromStream(stream);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    },
    [device, activeCall],
  );

  const handleSpeakerChange = useCallback(
    (deviceId: string) => {
      setSelectedSpeakerId(deviceId);
      device?.audio?.speakerDevices?.set(deviceId).catch(() => {});
    },
    [device],
  );

  const handleMuteMic = useCallback(() => {
    if (!device?.audio) return;
    const next = !micMuted;
    setMicMuted(next);
    if (next) setCallOnHold(false);
    device.audio.outgoing(next);
    if (
      activeCall &&
      typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function"
    ) {
      (activeCall as { mute: (m: boolean) => void }).mute(next);
    }
  }, [device, activeCall, micMuted]);

  const handleHold = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(true);
    setMicMuted(true);
    if (device?.audio) device.audio.outgoing(true);
    if (
      typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function"
    ) {
      (activeCall as { mute: (m: boolean) => void }).mute(true);
    }
  }, [activeCall, device]);

  const handleResume = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(false);
    setMicMuted(false);
    if (device?.audio) device.audio.outgoing(false);
    if (
      typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function"
    ) {
      (activeCall as { mute: (m: boolean) => void }).mute(false);
    }
  }, [activeCall, device]);

  const handleMuteSpeaker = useCallback(() => {
    if (!device?.audio) return;
    const next = !speakerMuted;
    setSpeakerMuted(next);
    device.audio.incoming(next);
  }, [device, speakerMuted]);

  return (
    <div className="container mx-auto max-w-lg p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Agent Desktop</h1>
        <div className="mt-2">
          <StatusBar
            currentStatus={effectiveStatus}
            onSetStatus={onSetStatus}
            disabled={statusLoading}
            error={runtimeError ?? statusError ?? undefined}
          />
        </div>

        <div className="mt-4 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Your desk phone number
          </p>
          <p className="mt-1 font-mono text-lg">{handsetNumber}</p>
        </div>

        {!activeCall && callHandling.heldCalls.length === 0 && !incomingCall && (
          <div className="mt-4 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Dial out
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={outboundTo}
                onChange={(e) => {
                  setOutboundTo(e.target.value);
                  setOutboundError(null);
                }}
                className="font-mono"
                aria-label="Phone number to dial"
              />
              <Button
                type="button"
                onClick={handleOutboundDial}
                className="shrink-0 gap-2"
                disabled={!isAvailable}
              >
                <Phone size={16} />
                Dial
              </Button>
            </div>
            {outboundError && (
              <p className="mt-2 text-sm text-destructive">{outboundError}</p>
            )}
          </div>
        )}

        {incomingCall ? (
          <IncomingCallPanel
            incomingCall={incomingCall}
            callHandling={callHandling}
            onDecline={handleDecline}
            className="mt-6"
          />
        ) : (
          <div className="mt-6 text-center">
            {isAvailable ? (
              <p className="text-muted-foreground">Waiting for calls...</p>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <BellOff className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  You're currently {effectiveStatus?.status ?? "offline"}
                </p>
                {effectiveStatus?.status !== "offline" && (
                  <p className="text-xs text-muted-foreground/60">
                    Incoming calls will not ring here while{" "}
                    {effectiveStatus?.status}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {callHandling.heldCalls.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-muted-foreground">
              On hold ({callHandling.heldCalls.length})
            </p>
            <ul className="mt-2 space-y-2">
              {callHandling.heldCalls.map((held) => {
                const params = (held as { parameters?: Record<string, string> })
                  .parameters;
                const from =
                  typeof params?.From === "string" ? params.From : "Unknown";
                return (
                  <li
                    key={
                      (held as { parameters?: Record<string, string> })
                        .parameters?.CallSid ?? `held-${from}`
                    }
                    className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2"
                  >
                    <span className="truncate font-mono text-sm">{from}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => callHandling.switchTo(held)}
                      >
                        <ArrowLeftRight size={14} />
                        Switch
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => callHandling.hangUp(held)}
                      >
                        <PhoneOff size={14} />
                        Hang up
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {activeCall && (
          <div className="mt-4 rounded-lg bg-green-100 p-4 dark:bg-green-900/30">
            <p className="font-medium">Connected</p>

            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Audio</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="agent-mic-select"
                    className="text-xs text-muted-foreground"
                  >
                    Microphone
                  </label>
                  <Select
                    value={selectedMicId || undefined}
                    onValueChange={handleMicChange}
                  >
                    <SelectTrigger id="agent-mic-select" className="w-full">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {microphones.map((d) => (
                        <SelectItem
                          key={d.deviceId}
                          value={d.deviceId || "default"}
                        >
                          {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                      {microphones.length === 0 && (
                        <SelectItem value="none" disabled>
                          No microphones
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`w-full gap-1 ${micMuted ? "bg-red-100 text-red-600 dark:bg-red-900/30" : ""}`}
                    onClick={handleMuteMic}
                  >
                    {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    {micMuted ? "Unmute mic" : "Mute mic"}
                  </Button>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="agent-speaker-select"
                    className="text-xs text-muted-foreground"
                  >
                    Speaker
                  </label>
                  <Select
                    value={selectedSpeakerId || undefined}
                    onValueChange={handleSpeakerChange}
                  >
                    <SelectTrigger id="agent-speaker-select" className="w-full">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent>
                      {speakers.map((d) => (
                        <SelectItem
                          key={d.deviceId}
                          value={d.deviceId || "default"}
                        >
                          {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                      {speakers.length === 0 && (
                        <SelectItem value="none" disabled>
                          No speakers
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`w-full gap-1 ${speakerMuted ? "bg-red-100 text-red-600 dark:bg-red-900/30" : ""}`}
                    onClick={handleMuteSpeaker}
                  >
                    {speakerMuted ? (
                      <VolumeX size={14} />
                    ) : (
                      <Volume2 size={14} />
                    )}
                    {speakerMuted ? "Unmute speaker" : "Mute speaker"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {callOnHold ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleResume}
                >
                  <Play size={14} />
                  Resume
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleHold}
                >
                  <Pause size={14} />
                  Hold
                </Button>
              )}
              <Button
                onClick={() => callHandling.hangUp()}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <PhoneOff size={14} />
                Hang up
              </Button>
            </div>
            <div className="mt-3 grid max-w-[140px] grid-cols-3 gap-2">
              {keypadKeys.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-9 p-0 font-mono text-base"
                  onClick={() => handleKeypadPress(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          className="mt-6 w-full"
          onClick={handleEndSession}
        >
          End session and leave
        </Button>
      </Card>
    </div>
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
