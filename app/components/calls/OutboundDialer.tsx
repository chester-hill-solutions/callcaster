import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type OutboundDialerProps = {
  value: string;
  error: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (value: string) => void;
  onDial: () => void;
  onClearError: () => void;
};

export function OutboundDialer({
  value,
  error,
  disabled = false,
  disabledReason,
  onChange,
  onDial,
  onClearError,
}: OutboundDialerProps) {
  return (
    <div className="space-y-2">
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
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button cannot receive focus, so its tooltip needs a focusable wrapper. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <span className={disabled ? "inline-flex cursor-not-allowed" : "inline-flex"} tabIndex={disabled && disabledReason ? 0 : undefined}>
                <Button
                  type="button"
                  onClick={onDial}
                  className="shrink-0 gap-2"
                  disabled={disabled}
                  aria-describedby={
                    disabled && disabledReason ? "outbound-dial-disabled-reason" : undefined
                  }
                >
                  <Phone size={16} />
                  Dial
                </Button>
              </span>
            </TooltipTrigger>
            {disabled && disabledReason ? (
              <TooltipContent>
                <p>{disabledReason}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
      </div>
      {disabled && disabledReason ? (
        <p
          id="outbound-dial-disabled-reason"
          className="mt-2 text-sm text-muted-foreground"
          role="status"
        >
          {disabledReason}
        </p>
      ) : null}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
