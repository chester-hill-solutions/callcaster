import type { ScriptOption } from "@chester-hill-solutions/scriptkit-call-script-core";
import type { RoutingTarget } from "@chester-hill-solutions/scriptkit-call-script-react";
import { Button } from "@/components/ui/button";
import { ScriptOptionRow } from "./ScriptOptionRow";

export type IvrResponsesEditorProps = {
  options: ScriptOption[];
  readOnly: boolean;
  routingTargets: RoutingTarget[];
  inboundPageByBlockId?: Record<string, string>;
  onOptionAdd: () => void;
  onOptionChange: (optionId: string, patch: Partial<ScriptOption>) => void;
  onOptionRemove: (optionId: string) => void;
};

/**
 * Recipient responses for one IVR step. Each row is what the runtime's Gather
 * matches (`value`: a keypad digit, or any spoken reply), how the answer is
 * labelled in results, and where the call goes next.
 */
export function IvrResponsesEditor({
  options,
  readOnly,
  routingTargets,
  inboundPageByBlockId,
  onOptionAdd,
  onOptionChange,
  onOptionRemove,
}: IvrResponsesEditorProps) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Recipient responses</span>
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
          <ScriptOptionRow
            key={option.id ?? index}
            mode="ivr"
            option={option}
            readOnly={readOnly}
            routingTargets={routingTargets}
            inboundPageByBlockId={inboundPageByBlockId}
            onChange={(patch) => onOptionChange(option.id ?? "", patch)}
            onRemove={() => onOptionRemove(option.id ?? "")}
          />
        ))
      )}
    </div>
  );
}
