import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import type { Database } from "@/lib/database.types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import {
  requireWorkspaceAccess,
  getHandsetNumberForWorkspace,
} from "@/lib/database.server";
import { extendHandsetSessionExpiry } from "@/lib/handset.server";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import { Input } from "@/components/ui/input";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, ArrowLeftRight } from "lucide-react";
import type { Call } from "@twilio/voice-sdk";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return null;
  const formData = await request.formData();
  if (formData.get("intent") !== "end_session") return null;

  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const workspaceId = params.id;
  if (!workspaceId) return new Response("Not found", { status: 404 });

  const serviceSupabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );
  await serviceSupabase
    .from("handset_session")
    .update({ status: "ended" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active");
  return null;
};

type LoaderData = {
  handsetNumber: string | null;
  clientIdentity: string;
  workspaceId: string;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Response("Workspace not found", { status: 404 });
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId,
  });

  const { data: handsetData } = await getHandsetNumberForWorkspace({
    supabaseClient: supabase,
    workspaceId,
  });

  if (!handsetData?.phone_number) {
    return {
      handsetNumber: null,
      clientIdentity: "",
      workspaceId,
    } satisfies LoaderData;
  }

  const clientIdentity = `handset-${crypto.randomUUID()}`;
  const expiresAt = extendHandsetSessionExpiry();

  const { error } = await supabase.from("handset_session").insert({
    user_id: user.id,
    workspace_id: workspaceId,
    client_identity: clientIdentity,
    status: "active",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Response("Failed to create handset session", { status: 500 });
  }

  return {
    handsetNumber: handsetData.phone_number,
    clientIdentity,
    workspaceId,
  } satisfies LoaderData;
};

export default function HandsetPage() {
  const { handsetNumber, clientIdentity, workspaceId } =
    useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const sessionEndedRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientIdentity || !workspaceId) return;
    const url = `/api/handset-token?workspace=${encodeURIComponent(workspaceId)}&client_identity=${encodeURIComponent(clientIdentity)}`;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setTokenError(data.error ?? `Request failed (${r.status})`);
          return;
        }
        if (data.token) setToken(data.token);
        else setTokenError(data.error ?? "Failed to get token");
      })
      .catch(() => setTokenError("Failed to get token"));
  }, [clientIdentity, workspaceId]);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    fetcher.submit(
      { intent: "end_session" },
      { method: "POST", action: `/workspaces/${workspaceId}/handset` }
    );
  }, [fetcher, workspaceId]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  if (!handsetNumber) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-muted-foreground">
            No phone number is set up for this workspace. Add a number in
            workspace settings and enable handset mode to receive calls here.
          </p>
          <Button asChild className="mt-4">
            <Link to={`/workspaces/${workspaceId}/settings`}>Workspace settings</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-destructive">{tokenError}</p>
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
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-muted-foreground">Connecting...</p>
        </Card>
      </div>
    );
  }

  return (
    <HandsetConnected
      token={token}
      handsetNumber={handsetNumber}
      clientIdentity={clientIdentity}
      workspaceId={workspaceId}
      endSession={endSession}
      onError={setTokenError}
      onNavigateBack={() => navigate(`/workspaces/${workspaceId}`)}
    />
  );
}

type HandsetConnectedProps = {
  token: string;
  handsetNumber: string;
  clientIdentity: string;
  workspaceId: string;
  endSession: () => void;
  onError: (message: string) => void;
  onNavigateBack: () => void;
};

function HandsetConnected({
  token,
  handsetNumber,
  clientIdentity,
  workspaceId,
  endSession,
  onError,
  onNavigateBack,
}: HandsetConnectedProps) {
  const [incomingCallState, setIncomingCallState] = useState<Call | null>(null);
  const noop = useCallback(() => {}, []);
  const deviceOptions = useMemo(() => ({ allowIncomingWhileBusy: true }), []);

  const handleIncomingCall = useCallback((call: Call) => setIncomingCallState(call), []);
  const handleConnectionError = useCallback((err: Error) => onError(err.message), [onError]);

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
  const fromNumber =
    incomingCall &&
    typeof incomingCall === "object" &&
    "parameters" in incomingCall &&
    typeof (incomingCall as { parameters?: { From?: string } }).parameters?.From === "string"
      ? (incomingCall as unknown as { parameters: { From: string } }).parameters.From
      : null;

  const handleAnswer = useCallback(() => {
    callHandling.answer();
  }, [callHandling]);

  const handleDecline = useCallback(() => {
    if (
      incomingCall &&
      typeof incomingCall === "object" &&
      "reject" in incomingCall &&
      typeof (incomingCall as { reject: () => void }).reject === "function"
    ) {
      (incomingCall as { reject: () => void }).reject();
    }
  }, [incomingCall]);

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
  }, [callHandling.activeCall, callHandling.heldCalls, callHandling.hangUp, connection.device, endSession, onNavigateBack]);

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
    [callHandling.activeCall]
  );

  const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

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
      if (selectedMicId === "" && devices.some((d) => d.kind === "audioinput")) {
        const first = devices.find((d) => d.kind === "audioinput");
        if (first?.deviceId) setSelectedMicId(first.deviceId);
      }
      if (selectedSpeakerId === "" && devices.some((d) => d.kind === "audiooutput")) {
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
    if (!permissionRequestedRef.current && typeof navigator?.mediaDevices?.getUserMedia === "function") {
      permissionRequestedRef.current = true;
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        refreshDevices();
      }).catch(() => {});
    }
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  const device = connection.device;
  const activeCall = callHandling.activeCall;

  useEffect(() => {
    setCallOnHold(false);
  }, [activeCall]);

  useEffect(() => {
    if (!activeCall || !device?.audio) return;
    if (selectedMicId) device.audio.setInputDevice(selectedMicId).catch(() => {});
    if (selectedSpeakerId) device.audio.speakerDevices?.set(selectedSpeakerId).catch(() => {});
  }, [activeCall, device, selectedMicId, selectedSpeakerId]);

  const handleMicChange = useCallback(
    (deviceId: string) => {
      setSelectedMicId(deviceId);
      if (!device?.audio) return;
      device.audio.setInputDevice(deviceId).then(() => {
        setMicMuted(false);
        if (activeCall && typeof (activeCall as { _setInputTracksFromStream?: (s: MediaStream) => Promise<void> })._setInputTracksFromStream === "function") {
          navigator.mediaDevices.getUserMedia({ audio: { deviceId } }).then((stream) => {
            (activeCall as { _setInputTracksFromStream: (s: MediaStream) => Promise<void> })._setInputTracksFromStream(stream);
          }).catch(() => {});
        }
      }).catch(() => {});
    },
    [device, activeCall]
  );

  const handleSpeakerChange = useCallback(
    (deviceId: string) => {
      setSelectedSpeakerId(deviceId);
      device?.audio?.speakerDevices?.set(deviceId).catch(() => {});
    },
    [device]
  );

  const handleMuteMic = useCallback(() => {
    if (!device?.audio) return;
    const next = !micMuted;
    setMicMuted(next);
    if (next) setCallOnHold(false);
    device.audio.outgoing(next);
    if (activeCall && typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function") {
      (activeCall as { mute: (m: boolean) => void }).mute(next);
    }
  }, [device, activeCall, micMuted]);

  const handleHold = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(true);
    setMicMuted(true);
    if (device?.audio) device.audio.outgoing(true);
    if (typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function") {
      (activeCall as { mute: (m: boolean) => void }).mute(true);
    }
  }, [activeCall, device]);

  const handleResume = useCallback(() => {
    if (!activeCall) return;
    setCallOnHold(false);
    setMicMuted(false);
    if (device?.audio) device.audio.outgoing(false);
    if (typeof (activeCall as { mute?: (m: boolean) => void }).mute === "function") {
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
    <div className="container mx-auto max-w-md p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Handset</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: {connection.status}
        </p>

        <div className="mt-4 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Call this number to ring here
          </p>
          <p className="mt-1 text-lg font-mono">{handsetNumber}</p>
        </div>

        {!callHandling.activeCall && callHandling.heldCalls.length === 0 && !incomingCall && (
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
                className="gap-2 shrink-0"
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
          <div className="mt-6 rounded-lg border-2 border-primary p-4">
            <p className="font-medium">Incoming call from {fromNumber ?? "unknown"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {callHandling.activeCall ? (
                <>
                  <Button onClick={callHandling.holdAndAnswer} className="flex-1 gap-2 min-w-[140px]">
                    <Pause size={16} />
                    Hold & answer
                  </Button>
                  <Button
                    onClick={handleDecline}
                    variant="outline"
                    className="flex-1 gap-2 min-w-[100px]"
                  >
                    Decline
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleAnswer} className="flex-1 gap-2 min-w-[140px]">
                    <Phone size={16} />
                    Pick up
                  </Button>
                  <Button
                    onClick={handleDecline}
                    variant="destructive"
                    className="flex-1 gap-2 min-w-[100px]"
                  >
                    <PhoneOff size={16} />
                    Decline
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-muted-foreground">
            Waiting for calls...
          </p>
        )}

        {callHandling.heldCalls.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">On hold ({callHandling.heldCalls.length})</p>
            <ul className="mt-2 space-y-2">
              {callHandling.heldCalls.map((held) => {
                const params = (held as { parameters?: Record<string, string> }).parameters;
                const from = typeof params?.From === "string" ? params.From : "Unknown";
                return (
                  <li
                    key={(held as { parameters?: Record<string, string> }).parameters?.CallSid ?? `held-${from}`}
                    className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2"
                  >
                    <span className="truncate font-mono text-sm">{from}</span>
                    <div className="flex gap-1 shrink-0">
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

        {callHandling.activeCall && (
          <div className="mt-4 rounded-lg bg-green-100 dark:bg-green-900/30 p-4">
            <p className="font-medium">Connected</p>

            <div className="mt-3 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Audio</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="handset-mic-select" className="text-xs text-muted-foreground">Microphone</label>
                  <Select value={selectedMicId || undefined} onValueChange={handleMicChange}>
                    <SelectTrigger id="handset-mic-select" className="w-full">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {microphones.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId || "default"}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                      {microphones.length === 0 && (
                        <SelectItem value="none" disabled>No microphones</SelectItem>
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
                  <label htmlFor="handset-speaker-select" className="text-xs text-muted-foreground">Speaker</label>
                  <Select value={selectedSpeakerId || undefined} onValueChange={handleSpeakerChange}>
                    <SelectTrigger id="handset-speaker-select" className="w-full">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent>
                      {speakers.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId || "default"}>
                          {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                      {speakers.length === 0 && (
                        <SelectItem value="none" disabled>No speakers</SelectItem>
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
                    {speakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {speakerMuted ? "Unmute speaker" : "Mute speaker"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {callOnHold ? (
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={handleResume}>
                  <Play size={14} />
                  Resume
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={handleHold}>
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
            <div className="mt-3 grid grid-cols-3 gap-2 max-w-[140px]">
              {keypadKeys.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-9 p-0 text-base font-mono"
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
