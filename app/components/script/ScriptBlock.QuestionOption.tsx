import { useState } from "react";
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
  type: "ivr" | "script";
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
      {type === "ivr" ? (
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
          <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
