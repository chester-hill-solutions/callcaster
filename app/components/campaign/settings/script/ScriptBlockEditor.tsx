import type {
  ScriptBlock,
  ScriptOption,
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

/** Sentinel for "no routing target" — Radix Select rejects empty-string values. */
const NO_ROUTING_TARGET = "__none__";

export type ScriptBlockEditorProps = {
  block: ScriptBlock;
  readOnly?: boolean;
  mediaNames: string[];
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

export function ScriptBlockEditor({
  block,
  readOnly = false,
  mediaNames,
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
  const prompt = "prompt" in block ? (block.prompt ?? "") : "";
  const body = block.type === "instruction" ? block.body : "";
  const options = "options" in block && block.options ? block.options : [];
  const isIvrBlock =
    block.callcasterType === "recorded" ||
    block.callcasterType === "synthetic" ||
    block.callcasterType === "say" ||
    block.speechType !== undefined;
  const takesOptions =
    block.type === "choice" ||
    block.type === "select" ||
    block.type === "radio" ||
    block.type === "checkbox" ||
    options.length > 0;

  const routingOptions = [
    { value: NO_ROUTING_TARGET, label: "(no target)" },
    ...routingTargets.map((target) => ({
      value: target.id,
      label:
        target.kind === "block"
          ? `${target.pageTitle} — ${target.label}`
          : target.label,
    })),
  ];

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
      {isIvrBlock && (
        <>
          <FormField label="IVR block type">
            <Select
              value={block.callcasterType ?? "say"}
              disabled={readOnly}
              onValueChange={(value) =>
                onChange({ callcasterType: value } as Partial<ScriptBlock>)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recorded">Recorded audio</SelectItem>
                <SelectItem value="synthetic">Synthetic speech</SelectItem>
                <SelectItem value="say">Say</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {block.speechType !== undefined && (
            <FormField label="Speech type">
              <Select
                value={block.speechType}
                disabled={readOnly}
                onValueChange={(value) =>
                  onChange({ speechType: value } as Partial<ScriptBlock>)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorded">Recorded audio</SelectItem>
                  <SelectItem value="synthetic">Synthetic speech</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
          <Label className="grid gap-2 font-normal">
            <span className="font-medium">
              {block.callcasterType === "recorded"
                ? "Audio file"
                : "Speech text"}
            </span>
            {block.callcasterType === "recorded" && mediaNames.length > 0 ? (
              <Select
                value={block.audioFile ?? ""}
                disabled={readOnly}
                onValueChange={(value) =>
                  onChange({ audioFile: value } as Partial<ScriptBlock>)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {mediaNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Textarea
                value={block.audioFile ?? ""}
                readOnly={readOnly}
                onChange={(event) =>
                  onChange({
                    audioFile: event.target.value,
                  } as Partial<ScriptBlock>)
                }
              />
            )}
          </Label>
        </>
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
              <FormField label="Next target">
                <Select
                  value={option.next || NO_ROUTING_TARGET}
                  disabled={readOnly}
                  onValueChange={(next) =>
                    onOptionChange(option.id ?? "", {
                      next: next === NO_ROUTING_TARGET ? undefined : next,
                    })
                  }
                >
                  <SelectTrigger>
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
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onMoveUp}>
            Move up
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onMoveDown}>
            Move down
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDuplicate}
          >
            Duplicate block
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>
            Remove block
          </Button>
        </div>
      )}
    </div>
  );
}
