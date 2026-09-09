import { useId } from "react";
import {
  isIvrPlaybackType,
  type ScriptBlock,
  type ScriptOption,
} from "@chester-hill-solutions/scriptkit-call-script-core";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getIvrPlaybackMode } from "@/lib/ivr-script-editor";
import { IvrResponsesEditor } from "./ScriptBlockEditor.IvrResponses";
import { IvrStepFields } from "./ScriptBlockEditor.IvrStep";
import { NO_ROUTING_TARGET, routingOptionsFor } from "./ScriptBlockEditor.routing";

export type ScriptBlockEditorProps = {
  block: ScriptBlock;
  readOnly?: boolean;
  /**
   * The script is played to a caller rather than read by an agent, so every
   * block is an audio step — including ones that still carry an input wire
   * type from an older editor or a live-call script.
   */
  audioFlow?: boolean;
  mediaNames: string[];
  audioPreviewUrl?: (fileName: string) => string;
  onUploadAudio?: (file: File) => Promise<string | null>;
  routingTargets: RoutingTarget[];
  onChange: (patch: Partial<ScriptBlock>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOptionAdd: () => void;
  onOptionChange: (optionId: string, patch: Partial<ScriptOption>) => void;
  onOptionRemove: (optionId: string) => void;
};

/** Whether a block is edited as an IVR audio step rather than an agent form input. */
export function isIvrStepBlock(block: ScriptBlock, audioFlow: boolean): boolean {
  return (
    audioFlow ||
    isIvrPlaybackType(block.callcasterType) ||
    block.speechType !== undefined
  );
}

export function ScriptBlockEditor({
  block,
  readOnly = false,
  audioFlow = false,
  mediaNames,
  audioPreviewUrl,
  onUploadAudio,
  routingTargets,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onOptionAdd,
  onOptionChange,
  onOptionRemove,
}: ScriptBlockEditorProps) {
  const titleId = useId();
  const options = "options" in block && block.options ? block.options : [];

  const actions = !readOnly && (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onMoveUp}>
        Move up
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onMoveDown}>
        Move down
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onDuplicate}>
        Duplicate block
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onRemove}>
        Remove block
      </Button>
    </div>
  );

  if (isIvrStepBlock(block, audioFlow)) {
    return (
      <div className="grid gap-3">
        <p className="text-[0.65rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {getIvrPlaybackMode(block) === "recorded"
            ? "Recording step"
            : "Spoken step"}
        </p>
        <FormField
          label="Step name"
          htmlFor={titleId}
          description="Names this step in results and exports."
        >
          <Input
            id={titleId}
            value={block.title ?? ""}
            readOnly={readOnly}
            onChange={(event) =>
              onChange({ title: event.target.value } as Partial<ScriptBlock>)
            }
          />
        </FormField>
        <IvrStepFields
          block={block}
          readOnly={readOnly}
          mediaNames={mediaNames}
          audioPreviewUrl={audioPreviewUrl}
          onUploadAudio={onUploadAudio}
          onChange={onChange}
        />
        <IvrResponsesEditor
          options={options}
          readOnly={readOnly}
          routingTargets={routingTargets}
          onOptionAdd={onOptionAdd}
          onOptionChange={onOptionChange}
          onOptionRemove={onOptionRemove}
        />
        {actions}
      </div>
    );
  }

  const prompt = "prompt" in block ? (block.prompt ?? "") : "";
  const body = block.type === "instruction" ? block.body : "";
  const takesOptions =
    block.type === "choice" ||
    block.type === "select" ||
    block.type === "radio" ||
    block.type === "checkbox" ||
    options.length > 0;
  const routingOptions = routingOptionsFor(routingTargets);

  return (
    <div className="grid gap-3">
      <p className="text-[0.65rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        {block.type}
      </p>
      {block.title !== undefined && (
        <Label className="grid gap-2 font-normal">
          <span className="font-medium">Title</span>
          <Input
            value={block.title}
            readOnly={readOnly}
            onChange={(event) =>
              onChange({ title: event.target.value } as Partial<ScriptBlock>)
            }
          />
        </Label>
      )}
      {block.type === "instruction" && (
        <Label className="grid gap-2 font-normal">
          <span className="font-medium">Body</span>
          <Textarea
            value={body}
            readOnly={readOnly}
            onChange={(event) =>
              onChange({
                body: event.target.value,
                content: event.target.value,
              } as Partial<ScriptBlock>)
            }
          />
        </Label>
      )}
      {block.type !== "instruction" && "prompt" in block && (
        <Label className="grid gap-2 font-normal">
          <span className="font-medium">Prompt</span>
          <Textarea
            value={prompt}
            readOnly={readOnly}
            onChange={(event) =>
              onChange({
                prompt: event.target.value,
                content: event.target.value,
              } as Partial<ScriptBlock>)
            }
          />
        </Label>
      )}
      {takesOptions && (
        <div className="grid gap-3">
          {options.map((option, index) => (
            <div
              key={option.id ?? index}
              className="grid gap-2 rounded-md border border-border bg-muted/30 p-3"
            >
              <Label className="grid gap-2 font-normal">
                <span className="font-medium">Option value</span>
                <Input
                  value={option.value}
                  readOnly={readOnly}
                  onChange={(event) =>
                    onOptionChange(option.id ?? "", {
                      value: event.target.value,
                    })
                  }
                />
              </Label>
              <Label className="grid gap-2 font-normal">
                <span className="font-medium">Option label</span>
                <Input
                  value={option.label}
                  readOnly={readOnly}
                  onChange={(event) =>
                    onOptionChange(option.id ?? "", {
                      label: event.target.value,
                      content: event.target.value,
                    })
                  }
                />
              </Label>
              <FormField
                label="Next target"
                htmlFor={`next-target-${option.id ?? index}`}
              >
                <Select
                  value={option.next || NO_ROUTING_TARGET}
                  disabled={readOnly}
                  onValueChange={(next) =>
                    onOptionChange(option.id ?? "", {
                      next: next === NO_ROUTING_TARGET ? undefined : next,
                    })
                  }
                >
                  <SelectTrigger id={`next-target-${option.id ?? index}`}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {routingOptions.map((routingOption) => (
                      <SelectItem
                        key={routingOption.value}
                        value={routingOption.value}
                      >
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
                  onClick={() => onOptionRemove(option.id ?? "")}
                >
                  Remove option
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button type="button" size="sm" variant="outline" onClick={onOptionAdd}>
              Add option
            </Button>
          )}
        </div>
      )}
      {actions}
    </div>
  );
}
