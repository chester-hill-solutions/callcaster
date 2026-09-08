import { useId } from "react";
import type { ScriptOption } from "@chester-hill-solutions/scriptkit-call-script-core";
import type { RoutingTarget } from "@chester-hill-solutions/scriptkit-call-script-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IVR_RESPONSE_KEYS,
  isKnownIvrResponseKey,
} from "@/lib/ivr-script-editor";
import { NO_ROUTING_TARGET, routingOptionsFor } from "./ScriptBlockEditor.routing";

export type IvrResponsesEditorProps = {
  options: ScriptOption[];
  readOnly: boolean;
  routingTargets: RoutingTarget[];
  onOptionAdd: () => void;
  onOptionChange: (optionId: string, patch: Partial<ScriptOption>) => void;
  onOptionRemove: (optionId: string) => void;
};

/**
 * Caller responses for one IVR step. Each row is what the runtime's Gather
 * matches (`value`: a keypad digit, or any spoken reply), how the answer is
 * labelled in results, and where the call goes next.
 */
export function IvrResponsesEditor({
  options,
  readOnly,
  routingTargets,
  onOptionAdd,
  onOptionChange,
  onOptionRemove,
}: IvrResponsesEditorProps) {
  const routingOptions = routingOptionsFor(routingTargets, "Continue to the next step");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Caller responses</span>
        {!readOnly && (
          <Button type="button" size="sm" variant="outline" onClick={onOptionAdd}>
            Add response
          </Button>
        )}
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No responses. The call continues to the next step after the audio.
        </p>
      ) : (
        options.map((option, index) => (
          <IvrResponseRow
            key={option.id ?? index}
            option={option}
            readOnly={readOnly}
            routingOptions={routingOptions}
            onChange={(patch) => onOptionChange(option.id ?? "", patch)}
            onRemove={() => onOptionRemove(option.id ?? "")}
          />
        ))
      )}
    </div>
  );
}

function IvrResponseRow({
  option,
  readOnly,
  routingOptions,
  onChange,
  onRemove,
}: {
  option: ScriptOption;
  readOnly: boolean;
  routingOptions: ReturnType<typeof routingOptionsFor>;
  onChange: (patch: Partial<ScriptOption>) => void;
  onRemove: () => void;
}) {
  const keyId = useId();
  const labelId = useId();
  const nextId = useId();
  const value = option.value ?? "";
  // Older scripts stored free-text values ("yes", "good"). Show them as-is so
  // nothing silently changes, but only offer the keys the runtime can match.
  const keyChoices =
    value.length > 0 && !isKnownIvrResponseKey(value)
      ? [{ value, label: `${value} (not a keypad key)` }, ...IVR_RESPONSE_KEYS]
      : IVR_RESPONSE_KEYS;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-3">
      <FormField label="Caller answers with" htmlFor={keyId}>
        <Select
          value={value}
          disabled={readOnly}
          onValueChange={(next) => onChange({ value: next })}
        >
          <SelectTrigger id={keyId}>
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
      </FormField>
      <FormField label="Answer label" htmlFor={labelId} description="Shown in results and exports.">
        <Input
          id={labelId}
          value={option.label}
          readOnly={readOnly}
          onChange={(event) =>
            onChange({ label: event.target.value, content: event.target.value })
          }
        />
      </FormField>
      <FormField label="Then go to" htmlFor={nextId}>
        <Select
          value={option.next || NO_ROUTING_TARGET}
          disabled={readOnly}
          onValueChange={(next) =>
            onChange({ next: next === NO_ROUTING_TARGET ? undefined : next })
          }
        >
          <SelectTrigger id={nextId}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {routingOptions.map((routingOption) => (
              <SelectItem key={routingOption.value} value={routingOption.value}>
                {routingOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {!readOnly && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start sm:col-span-3"
          onClick={onRemove}
        >
          Remove response
        </Button>
      )}
    </div>
  );
}
