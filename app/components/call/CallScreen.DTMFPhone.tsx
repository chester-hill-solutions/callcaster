import { Button } from "@/components/ui/button";
import { cn, formatTimeShort } from "@/lib/utils";
import { KEYPAD_KEYS } from "@/lib/dtmf";

interface PhoneKeypadProps {
  onKeyPress: (key: string) => void;
  displayState: string;
  displayColor: string;
  callDuration: number;
}

export function PhoneKeypad({
  onKeyPress,
  displayState,
  displayColor,
  callDuration,
}: PhoneKeypadProps) {
  return (
    <div
      className="overflow-hidden rounded-lg border-2 border-border"
      style={{ borderColor: displayColor }}
    >
      <div
        className="flex items-center justify-center rounded-t-lg px-3 py-2 font-Tabac-Slab text-sm text-white"
        style={{ background: displayColor }}
      >
        {displayState === "failed" && <span>Call Failed</span>}
        {displayState === "dialing" && (
          <span>Dialing... {formatTimeShort(callDuration)}</span>
        )}
        {displayState === "connected" && (
          <span>Connected {formatTimeShort(callDuration)}</span>
        )}
        {displayState === "no-answer" && <span>No Answer</span>}
        {displayState === "voicemail" && <span>Voicemail Left</span>}
        {displayState === "completed" && <span>Call Completed</span>}
        {displayState === "idle" && <span>Pending</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        {KEYPAD_KEYS.map((item) => (
          <Button
            key={item}
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-10 min-w-10 p-0 text-base font-semibold",
              "transition-colors duration-150 hover:bg-muted",
            )}
            onClick={() => onKeyPress(item)}
          >
            {item}
          </Button>
        ))}
      </div>
    </div>
  );
}
