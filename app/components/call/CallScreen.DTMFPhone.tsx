import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PhoneKeypadProps {
  onKeyPress: (key: string) => void;
  displayState: string;
  displayColor: string;
  callDuration: number;
}

const KEYPAD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"] as const;

export function PhoneKeypad({
  onKeyPress,
  displayState,
  displayColor,
  callDuration,
}: PhoneKeypadProps) {
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

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
          <span>Dialing... {formatTime(callDuration)}</span>
        )}
        {displayState === "connected" && (
          <span>Connected {formatTime(callDuration)}</span>
        )}
        {displayState === "no-answer" && <span>No Answer</span>}
        {displayState === "voicemail" && <span>Voicemail Left</span>}
        {displayState === "completed" && <span>Call Completed</span>}
        {displayState === "idle" && <span>Pending</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        {KEYPAD_KEYS.map((item) => (
          <Button
            key={String(item)}
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-10 min-w-10 p-0 text-base font-semibold",
              "transition-colors duration-150 hover:bg-muted",
            )}
            onClick={() => onKeyPress(String(item))}
          >
            {item}
          </Button>
        ))}
      </div>
    </div>
  );
}
