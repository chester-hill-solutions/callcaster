import { Button } from "@/components/ui/button";
import { SOFTPHONE_KEYPAD_KEYS } from "@/components/calls/softphone-constants";

type KeypadProps = {
  onKeyPress: (key: string) => void;
};

export function Keypad({ onKeyPress }: KeypadProps) {
  return (
    <div className="mt-3 grid max-w-[140px] grid-cols-3 gap-2">
      {SOFTPHONE_KEYPAD_KEYS.map((key) => (
        <Button
          key={key}
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 w-9 p-0 font-mono text-base"
          onClick={() => onKeyPress(key)}
        >
          {key}
        </Button>
      ))}
    </div>
  );
}
