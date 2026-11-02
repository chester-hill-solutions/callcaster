import { Phone } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
  pending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (value: string) => void;
  onDial: () => void;
  onClearError: () => void;
};

export function OutboundDialer({
  value,
  error,
  pending = false,
  disabled = false,
  disabledReason,
  onChange,
  onDial,
  onClearError,
}: OutboundDialerProps) {
  const isDisabled = disabled || pending;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Dial out</p>
      <div className="mt-2 flex gap-2">
        <Input
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={value}
          disabled={pending}
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
              <span className={isDisabled ? "inline-flex cursor-not-allowed" : "inline-flex"} tabIndex={isDisabled && disabledReason ? 0 : undefined}>
                <Button
                  type="button"
                  onClick={onDial}
                  className="shrink-0 gap-2"
                  disabled={isDisabled}
                  aria-busy={pending}
                  aria-describedby={
                    isDisabled && disabledReason ? "outbound-dial-disabled-reason" : undefined
                  }
                >
                  <Phone size={16} />
                  {pending ? "Preparing…" : "Dial"}
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
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
