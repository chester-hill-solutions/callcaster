import { useState, useEffect } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Block, BlockOption, IVRBlock, IVROption, Page } from "@/lib/types";
import {
  ScriptBlockContentInput,
  ScriptBlockOptionsSection,
} from "@/components/script/ScriptBlock.Sections";

type ScriptEditorBlock = Block | IVRBlock;
type BlockDictionary = Record<string, ScriptEditorBlock>;
type PageDictionary = Record<string, Page>;

function isIVRBlock(block: ScriptEditorBlock): block is IVRBlock {
  return (
    "speechType" in block && "audioFile" in block && "responseType" in block
  );
}

export default function MergedQuestionBlock({
  block,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  pages,
  blocks,
  type,
  mediaNames,
  openBlock,
  setOpenBlock,
  onReorder,
}: {
  block: ScriptEditorBlock;
  onUpdate: (state: Partial<ScriptEditorBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  pages: PageDictionary;
  blocks: BlockDictionary;
  type: "script" | "ivr" | "inbound_ivr";
  mediaNames: string[];
  openBlock: string | null;
  setOpenBlock: (id: string | null) => void;
  onReorder: (
    draggedId: string,
    targetId: string,
    dropPosition: "top" | "bottom",
  ) => void;
}) {
  const [localBlock, setLocalBlock] = useState<ScriptEditorBlock>(block);
  const [acceptDrop, setAcceptDrop] = useState<"none" | "top" | "bottom">(
    "none",
  );
  const isAudioType = type === "ivr" || type === "inbound_ivr";

  const questionTypes =
    type === "script"
      ? [
          { value: "textarea", label: "Text Input" },
          { value: "textblock", label: "Static Text" },
          { value: "radio", label: "Radio" },
          { value: "dropdown", label: "Dropdown" },
          { value: "boolean", label: "Boolean" },
          { value: "multi", label: "Multi-Select" },
        ]
      : [
          { value: "synthetic", label: "Synthetic" },
          { value: "recorded", label: "Audio File" },
        ];

  const responseTypes = type === "inbound_ivr"
    ? [
        { value: "dtmf", label: "DTMF Only (Best for simple IVR)" },
        { value: "dtmf speech", label: "DTMF and Speech (Best for complex IVR)" },
      ]
    : [
        { value: "speech", label: "Speech Only (Best for recording messages)" },
        { value: "dtmf", label: "DTMF Only (Best for simple IVR)" },
        { value: "dtmf speech", label: "DTMF and Speech (Best for complex IVR)" },
      ];

  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  const handleChange = (
    field: keyof Block | keyof IVRBlock,
    value:
      | string
      | string[]
      | BlockOption[]
      | IVROption[]
      | (BlockOption | IVROption)[],
  ) => {
    const updatedBlock = {
      ...localBlock,
      [field]: value,
      ...(field === "content" &&
        typeof value === "string" && { value: value.toLowerCase() }),
    };
    setLocalBlock(updatedBlock);
    onUpdate(updatedBlock);
  };

  const handleOptionChange = (
    index: number,
    newOption: BlockOption | IVROption,
  ) => {
    const newOptions = [...(localBlock.options || [])];
    newOptions[index] = newOption;
    handleChange("options", newOptions);
  };

  const handleNextChange = (index: number, value: string) => {
    const newOptions = (localBlock.options || []).map((opt, i) => {
      if (i !== index) return opt;
      return { ...opt, next: value };
    });
    handleChange("options", newOptions);
  };

  const handleAddOption = () => {
    const newOptions = [
      ...(localBlock.options || []),
      { content: "", next: "", value: type === "ivr" || type === "inbound_ivr" ? "vx-any" : "" },
    ];
    handleChange("options", newOptions);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = (localBlock.options || []).filter((_, i) => i !== index);
    handleChange("options", newOptions);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedBlockData = JSON.parse(event.dataTransfer.getData("cardData"));

    if (droppedBlockData.id !== localBlock.id) {
      onReorder(
        droppedBlockData.id,
        localBlock.id,
        acceptDrop as "top" | "bottom",
      );
    }

    setAcceptDrop("none");
  };

  return (
    block && (
      <div
        className={`border-2 border-x-0 py-1 ${
          acceptDrop === "top"
            ? "border-b-transparent border-t-primary"
            : acceptDrop === "bottom"
              ? "border-b-primary border-t-transparent"
              : "border-b-transparent border-t-transparent"
        }`}
      >
        <Card
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "cardData",
              JSON.stringify({ title: localBlock.title, id: localBlock.id }),
            );
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const midpoint = (rect.top + rect.bottom) / 2;
            setAcceptDrop(event.clientY <= midpoint ? "top" : "bottom");
          }}
          onDragLeave={() => {
            setAcceptDrop("none");
          }}
          onDrop={handleDrop}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle
                className="w-full cursor-pointer"
                onClick={() =>
                  setOpenBlock(openBlock === block.id ? null : block.id)
                }
              >
                {localBlock?.title || `Block ${localBlock?.id}`}
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setOpenBlock(openBlock === block.id ? null : block.id)
                  }
                  aria-label={
                    openBlock === block.id ? "Collapse block" : "Expand block"
                  }
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openBlock === block.id ? "rotate-180" : ""}`}
                  />
                </Button>
                <Button variant="ghost" size="icon" onClick={onMoveUp}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onMoveDown}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onRemove}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          {openBlock === block.id && (
            <CardContent>
              <div className="space-y-4">
                <Input
                  value={localBlock?.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="Block Title"
                  className="bg-white"
                />
                {!isAudioType ? (
                  <Select
                    value={localBlock.type}
                    onValueChange={(value) => handleChange("type", value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select block type" />
                    </SelectTrigger>
                    <SelectContent>
                      {questionTypes.map((questionType) => (
                        <SelectItem
                          key={questionType.value}
                          value={questionType.value}
                        >
                          {questionType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : isIVRBlock(localBlock) ? (
                  <Select
                    value={localBlock.speechType}
                    onValueChange={(value) => handleChange("speechType", value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select block type" />
                    </SelectTrigger>
                    <SelectContent>
                      {questionTypes.map((questionType) => (
                        <SelectItem
                          key={questionType.value}
                          value={questionType.value}
                        >
                          {questionType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <ScriptBlockContentInput
                  block={localBlock}
                  type={type}
                  mediaNames={mediaNames}
                  onChange={handleChange}
                />
                {isAudioType && isIVRBlock(localBlock) && (
                  <Select
                    defaultValue={localBlock.responseType ?? undefined}
                    onValueChange={(value) =>
                      handleChange("responseType", value)
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select response type" />
                    </SelectTrigger>
                    <SelectContent>
                      {responseTypes.map((responseType) => (
                        <SelectItem
                          key={responseType.value}
                          value={responseType.value}
                        >
                          {responseType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <ScriptBlockOptionsSection
                block={localBlock}
                type={type}
                pages={pages}
                blocks={blocks}
                onAddOption={handleAddOption}
                onRemoveOption={handleRemoveOption}
                onOptionChange={handleOptionChange}
                onNextChange={handleNextChange}
              />
            </CardContent>
          )}
        </Card>
      </div>
    )
  );
}
