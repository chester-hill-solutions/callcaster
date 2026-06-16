import type { Call } from "@twilio/voice-sdk";
import { Pause, Phone, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";

type IncomingCallHandlers = {
  activeCall: Call | null;
  holdAndAnswer: () => void;
  answer: () => void;
};

function getIncomingFromNumber(incomingCall: Call | null): string | null {
  if (
    incomingCall &&
    typeof incomingCall === "object" &&
    "parameters" in incomingCall &&
    typeof (incomingCall as { parameters?: { From?: string } }).parameters?.From ===
      "string"
  ) {
    return (incomingCall as unknown as { parameters: { From: string } }).parameters.From;
  }
  return null;
}

export function IncomingCallPanel({
  incomingCall,
  callHandling,
  onDecline,
  className = "",
}: {
  incomingCall: Call | null;
  callHandling: IncomingCallHandlers;
  onDecline: () => void;
  className?: string;
}) {
  if (!incomingCall) {
    return null;
  }

  const fromNumber = getIncomingFromNumber(incomingCall);

  return (
    <div className={`rounded-lg border-2 border-primary bg-card p-4 ${className}`}>
      <p className="font-medium">Incoming call from {fromNumber ?? "unknown"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {callHandling.activeCall ? (
          <>
            <Button
              type="button"
              onClick={callHandling.holdAndAnswer}
              className="min-w-[140px] flex-1 gap-2"
            >
              <Pause size={16} />
              Hold & answer
            </Button>
            <Button
              type="button"
              onClick={onDecline}
              variant="outline"
              className="min-w-[100px] flex-1 gap-2"
            >
              Decline
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={callHandling.answer}
              className="min-w-[140px] flex-1 gap-2"
            >
              <Phone size={16} />
              Pick up
            </Button>
            <Button
              type="button"
              onClick={onDecline}
              variant="destructive"
              className="min-w-[100px] flex-1 gap-2"
            >
              <PhoneOff size={16} />
              Decline
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function declineIncomingCall(incomingCall: Call | null): void {
  if (
    incomingCall &&
    typeof incomingCall === "object" &&
    "reject" in incomingCall &&
    typeof (incomingCall as { reject: () => void }).reject === "function"
  ) {
    (incomingCall as { reject: () => void }).reject();
  }
}
