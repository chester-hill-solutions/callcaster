import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OutboundDialerProps = {
  value: string;
  error: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  onDial: () => void;
  onClearError: () => void;
};

export function OutboundDialer({
  value,
  error,
  disabled = false,
  onChange,
  onDial,
  onClearError,
}: OutboundDialerProps) {
  return (
    <div className="mt-4 rounded-lg border p-4">
      <p className="text-sm font-medium text-muted-foreground">Dial out</p>
      <div className="mt-2 flex gap-2">
        <Input
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onClearError();
          }}
          className="font-mono"
          aria-label="Phone number to dial"
        />
        <Button
          type="button"
          onClick={onDial}
          className="shrink-0 gap-2"
          disabled={disabled}
        >
          <Phone size={16} />
          Dial
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
