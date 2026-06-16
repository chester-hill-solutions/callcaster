import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { MdDialpad } from "react-icons/md";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Block, BlockOption, IVRBlock, IVROption, Page } from "@/lib/types";

type ScriptEditorBlock = Block | IVRBlock;
type BlockDictionary = Record<string, ScriptEditorBlock>;
type PageDictionary = Record<string, Page>;

function parseInboundTarget(next: string): {
  type: "hangup" | "queue" | "forward" | "voicemail" | "unknown";
  value: string;
} {
  if (next === "hangup") return { type: "hangup", value: "" };
  if (next.startsWith("queue:")) return { type: "queue", value: next.slice(6) };
  if (next.startsWith("forward:")) return { type: "forward", value: next.slice(8) };
  if (next.startsWith("voicemail:")) return { type: "voicemail", value: next.slice(10) };
  return { type: "unknown", value: next };
}

export function ScriptBlockQuestionOption({
  option,
  index,
  onRemove,
  onChange,
  onNextChange,
  pages,
  blocks,
  type,
}: {
  option: BlockOption | IVROption;
  index: number;
  onRemove: (index: number) => void;
  onChange: (index: number, value: BlockOption | IVROption) => void;
  onNextChange: (index: number, value: string) => void;
  pages: PageDictionary;
  blocks: BlockDictionary;
  type: "ivr" | "script" | "inbound_ivr";
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const pageEntries = Object.entries(pages);

  const handleSave = (input: string) => {
    onChange(index, { ...option, value: input });
    setIsPopoverOpen(false);
  };
  const inputOptions = [...Array(10).keys(), "Voice - Any"];

  return (
    <div className="mb-2 flex items-center space-x-2">
      {type === "inbound_ivr" ? (
        <InboundInputSection option={option} index={index} onChange={onChange} />
      ) : type === "ivr" ? (
        <div className="flex flex-col">
          <p className="mb-1 text-sm font-medium">Input</p>
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[130px] justify-between bg-white"
              >
                {option.value === "vx-any" ? "Voice - Any" : option.value}
                <MdDialpad />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <div className="grid grid-cols-3 gap-2 p-4">
                {inputOptions.map((opt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className={`h-12 ${opt === "Voice - Any" ? "col-span-2" : ""}`}
                    onClick={() =>
                      handleSave(
                        opt === "Voice - Any" ? "vx-any" : opt.toString(),
                      )
                    }
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <div className="flex flex-col">
          <p className="mb-1 text-sm font-medium">Input</p>
          <Input
            value={option.content}
            onChange={(e) =>
              onChange(index, {
                ...option,
                content: e.target.value,
                value: e.target.value.replace(" ", "-").toLowerCase(),
              })
            }
            placeholder="Option content"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col">
        <p className="mb-1 text-sm font-medium">Next Step</p>
        <div className="flex">
          {type === "inbound_ivr" ? (
            <InboundNextSelect
              value={option.next}
              onChange={(value) => onNextChange(index, value)}
            />
          ) : (
            <Select
              value={option.next}
              onValueChange={(value) => onNextChange(index, value)}
            >
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="Select next step" />
              </SelectTrigger>
              <SelectContent>
                {pageEntries.map(([pageId, page]) => (
                  <SelectGroup key={pageId}>
                    <SelectLabel>Section: {page.title || pageId}</SelectLabel>
                    <SelectItem value={pageId}>
                      Start of {page.title || pageId}
                    </SelectItem>
                    {page?.blocks?.map((blockId) => (
                      <SelectItem key={blockId} value={`${pageId}:${blockId}`}>
                        {page.title || pageId} →{" "}
                        {blocks[blockId]?.title || `Block ${blockId}`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectGroup>
                  <SelectLabel>Special Actions</SelectLabel>
                  <SelectItem value="hangup">Hang Up</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboundInputSection({
  option,
  index,
  onChange,
}: {
  option: BlockOption | IVROption;
  index: number;
  onChange: (index: number, value: BlockOption | IVROption) => void;
}) {
  return (
    <div className="flex flex-col">
      <p className="mb-1 text-sm font-medium">Input</p>
      <Input
        value={option.content || ""}
        onChange={(e) =>
          onChange(index, {
            ...option,
            content: e.target.value,
            value:
              e.target.value === "vx-any"
                ? "vx-any"
                : String(
                    Number(e.target.value) >= 0 && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                  ),
          })
        }
        placeholder="DTMF digit (0-9) or Voice - Any"
      />
    </div>
  );
}

function InboundNextSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const target = parseInboundTarget(value || "");
  const [customValue, setCustomValue] = useState(target.value);

  const handleTypeChange = useCallback(
    (newType: string) => {
      if (newType === "hangup") {
        onChange("hangup");
      } else if (newType === "queue") {
        onChange(`queue:${customValue}`);
      } else if (newType === "forward") {
        onChange(`forward:${customValue}`);
      } else if (newType === "voicemail") {
        onChange(`voicemail:${customValue}`);
      }
    },
    [customValue, onChange],
  );

  const handleValueChange = useCallback(
    (newValue: string) => {
      setCustomValue(newValue);
      if (target.type === "queue") {
        onChange(`queue:${newValue}`);
      } else if (target.type === "forward") {
        onChange(`forward:${newValue}`);
      } else if (target.type === "voicemail") {
        onChange(`voicemail:${newValue}`);
      }
    },
    [target.type, onChange],
  );

  return (
    <div className="flex w-full gap-2">
      <Select value={target.type} onValueChange={handleTypeChange}>
        <SelectTrigger className="w-[180px] bg-white">
          <SelectValue placeholder="Target type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hangup">Hang Up</SelectItem>
          <SelectItem value="queue">Queue</SelectItem>
          <SelectItem value="forward">Forward to Number</SelectItem>
          <SelectItem value="voicemail">Voicemail</SelectItem>
        </SelectContent>
      </Select>
      {target.type === "queue" && (
        <Input
          value={customValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Queue ID"
          className="bg-white"
        />
      )}
      {target.type === "forward" && (
        <Input
          value={customValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="+1234567890"
          className="bg-white"
        />
      )}
      {target.type === "voicemail" && (
        <Input
          value={customValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="email@example.com"
          className="bg-white"
        />
      )}
    </div>
  );
}
