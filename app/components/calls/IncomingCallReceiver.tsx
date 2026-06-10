import { useCallback, useMemo, useState } from "react";
import type { Call } from "@twilio/voice-sdk";

import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import {
  declineIncomingCall,
  IncomingCallPanel,
} from "@/components/calls/IncomingCallPanel";
import { Badge } from "@/components/ui/badge";

type IncomingCallReceiverProps = {
  token: string;
  workspaceId: string;
  handsetNumber: string | null;
  onError?: (message: string) => void;
};

export function IncomingCallReceiver({
  token,
  workspaceId,
  handsetNumber,
  onError,
}: IncomingCallReceiverProps) {
  const [incomingCallState, setIncomingCallState] = useState<Call | null>(null);
  const noop = useCallback(() => {}, []);
  const deviceOptions = useMemo(() => ({ allowIncomingWhileBusy: true }), []);

  const connection = useTwilioConnection({
    token,
    deviceOptions,
    onIncomingCall: setIncomingCallState,
    onStatusChange: noop,
    onError: (error) => onError?.(error.message),
    onDeviceBusyChange: noop,
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    incomingCall: incomingCallState,
    onStatusChange: noop,
    onError: (error) => onError?.(error.message),
    onDeviceBusyChange: noop,
  });

  const handleDecline = useCallback(() => {
    declineIncomingCall(callHandling.incomingCall);
    setIncomingCallState(null);
  }, [callHandling.incomingCall]);

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-Zilla-Slab text-lg font-semibold text-brand-primary">
            Incoming pickup
          </p>
          <p className="text-sm text-muted-foreground">
            Listening for calls to{" "}
            <span className="font-mono">{handsetNumber ?? "your workspace number"}</span>
          </p>
        </div>
        <Badge variant={connection.status === "Registered" ? "default" : "secondary"}>
          {connection.status}
        </Badge>
      </div>

      <IncomingCallPanel
        incomingCall={callHandling.incomingCall}
        callHandling={callHandling}
        onDecline={handleDecline}
        className="mt-4"
      />

      {!callHandling.incomingCall ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Leave this page open while you work elsewhere in the workspace. Incoming calls will
          appear here so you can pick up.
        </p>
      ) : null}
    </div>
  );
}
