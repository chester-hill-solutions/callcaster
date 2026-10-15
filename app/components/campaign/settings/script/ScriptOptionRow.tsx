import { useId } from "react";
import type { ScriptOption } from "@chester-hill-solutions/scriptkit-call-script-core";
import type { RoutingTarget } from "@chester-hill-solutions/scriptkit-call-script-react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IVR_RESPONSE_KEYS, isKnownIvrResponseKey } from "@/lib/ivr-script-editor";
import { NO_ROUTING_TARGET, routingOptionsFor } from "./ScriptBlockEditor.routing";

export type ScriptOptionRowProps = {
  mode: "live" | "ivr";
  option: ScriptOption;
  readOnly: boolean;
  routingTargets: RoutingTarget[];
  inboundPageByBlockId?: Record<string, string>;
  onChange: (patch: Partial<ScriptOption>) => void;
  onRemove: () => void;
};

export function ScriptOptionRow({
  mode,
  option,
  readOnly,
  routingTargets,
  inboundPageByBlockId,
  onChange,
  onRemove,
}: ScriptOptionRowProps) {
  const labelId = useId();
  const valueId = useId();
  const nextId = useId();
  const value = option.value ?? "";
  const routingOptions = routingOptionsFor(
    routingTargets,
    mode === "ivr" ? "Continue to the next step" : "(no target)",
    mode === "ivr" ? inboundPageByBlockId : undefined,
  );
  const targetChoices = option.next && !routingOptions.some((target) => target.value === option.next)
    ? [{ value: option.next, label: option.next }, ...routingOptions]
    : routingOptions;
  const keyChoices =
    value.length > 0 && !isKnownIvrResponseKey(value)
      ? [{ value, label: `${value} (not a keypad key)` }, ...IVR_RESPONSE_KEYS]
      : IVR_RESPONSE_KEYS;

  return (
    <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] items-end gap-2 overflow-x-auto rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-1">
        <Input
          id={labelId}
          value={option.label}
          readOnly={readOnly}
          aria-label={mode === "ivr" ? "Answer label" : "Option label"}
          placeholder={mode === "ivr" ? "Answer label" : "Option label"}
          onChange={(event) =>
            onChange({ label: event.target.value, content: event.target.value })
          }
        />
      </div>

      <div className="grid gap-1">
        {mode === "ivr" ? (
          <Select
            value={value}
            disabled={readOnly}
            onValueChange={(next) => onChange({ value: next })}
          >
            <SelectTrigger id={valueId} aria-label="Recipient answers with">
              <SelectValue placeholder="Select a key…" />
            </SelectTrigger>
            <SelectContent>
              {keyChoices.map((key) => (
                <SelectItem key={key.value} value={key.value}>
                  {key.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={valueId}
            value={value}
            readOnly={readOnly}
            aria-label="Option value"
            placeholder="Option value"
            onChange={(event) => onChange({ value: event.target.value })}
          />
        )}
      </div>

      <div className="grid gap-1">
        <Select
          value={option.next || NO_ROUTING_TARGET}
          disabled={readOnly}
          onValueChange={(next) =>
            onChange({ next: next === NO_ROUTING_TARGET ? undefined : next })
          }
        >
          <SelectTrigger
            id={nextId}
            aria-label={mode === "ivr" ? "Then go to" : "Next target"}
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {targetChoices.map((routingOption) => (
              <SelectItem key={routingOption.value} value={routingOption.value}>
                {routingOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!readOnly && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Remove option"
          title="Remove option"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
