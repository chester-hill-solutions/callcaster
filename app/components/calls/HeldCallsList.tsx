import type { Call } from "@twilio/voice-sdk";
import { ArrowLeftRight, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCallFrom, getHeldCallKey } from "@/lib/twilio/twilio-call-adapter.client";

type HeldCallsListProps = {
  heldCalls: Call[];
  onSwitch: (call: Call) => void;
  onHangUp: (call: Call) => void;
};

export function HeldCallsList({
  heldCalls,
  onSwitch,
  onHangUp,
}: HeldCallsListProps) {
  if (heldCalls.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-sm font-medium text-muted-foreground">
        On hold ({heldCalls.length})
      </p>
      <ul className="mt-2 space-y-2">
        {heldCalls.map((held) => {
          const from = getCallFrom(held);
          return (
            <li
              key={getHeldCallKey(held, from)}
              className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2"
            >
              <span className="truncate font-mono text-sm">{from}</span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => onSwitch(held)}
                >
                  <ArrowLeftRight size={14} />
                  Switch
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={() => onHangUp(held)}
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
  );
}
