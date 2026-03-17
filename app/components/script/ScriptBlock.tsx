import { useState, useEffect } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NavLink } from "@remix-run/react";
import { Block, BlockOption, IVRBlock, IVROption, Page } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MdDialpad } from "react-icons/md";

type ScriptEditorBlock = Block | IVRBlock;
type BlockDictionary = Record<string, ScriptEditorBlock>;
type PageDictionary = Record<string, Page>;

function isIVRBlock(block: ScriptEditorBlock): block is IVRBlock {
  return (
    "speechType" in block && "audioFile" in block && "responseType" in block
  );
}

const QuestionBlockOption = ({
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
}) => {
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
};

const MergedQuestionBlock = ({
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
  type: "script" | "ivr";
  mediaNames: string[];
  openBlock: string | null;
  setOpenBlock: (id: string | null) => void;
  onReorder: (
    draggedId: string,
    targetId: string,
    dropPosition: "top" | "bottom",
  ) => void;
}) => {
  const [localBlock, setLocalBlock] = useState<ScriptEditorBlock>(block);
  const [acceptDrop, setAcceptDrop] = useState<"none" | "top" | "bottom">(
    "none",
  );
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

  const responseTypes = [
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
      { content: "", next: "", value: type === "ivr" ? "vx-any" : "" },
    ];
    handleChange("options", newOptions);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = (localBlock.options || []).filter((_, i) => i !== index);
    handleChange("options", newOptions);
  };

  const renderContentInput = () => {
    if (type === "script") {
      return (
        <Textarea
          value={localBlock.content}
          onChange={(e) => handleChange("content", e.target.value)}
          placeholder="Your script or question"
          className="min-h-[100px] bg-white"
        />
      );
    }

    if (!isIVRBlock(localBlock)) {
      return null;
    }

    if (localBlock.speechType === "synthetic") {
      return (
        <Textarea
          value={localBlock.audioFile}
          onChange={(e) => handleChange("audioFile", e.target.value)}
          placeholder="Your synthetic greeting"
          className="min-h-[100px] bg-white"
        />
      );
    }

    if (localBlock.speechType === "recorded") {
      return (
        <div className="flex gap-2">
          <Select
            value={localBlock.audioFile}
            onValueChange={(value) => handleChange("audioFile", value)}
          >
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="Select an audio file" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              {mediaNames
                .filter((mediaName) => !mediaName.startsWith("voicemail-"))
                .map((mediaName) => (
                  <SelectItem key={mediaName} value={mediaName}>
                    {mediaName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button size="icon" asChild>
            <NavLink to={"../../audios"} relative="path">
              <Plus className="h-4 w-4" />
            </NavLink>
          </Button>
        </div>
      );
    }
    return null;
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
                {type === "script" ? (
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
                {renderContentInput()}
                {type === "ivr" && isIVRBlock(localBlock) && (
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
                      {responseTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {((type === "script" &&
                ["radio", "dropdown", "multi"].includes(localBlock.type)) ||
                type === "ivr") && (
                <div className="mt-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Options</h3>
                      {(type === "script" ||
                        (type === "ivr" &&
                          isIVRBlock(localBlock) &&
                          localBlock.responseType &&
                          localBlock.responseType !== "speech")) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-primary"
                          onClick={handleAddOption}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Option
                        </Button>
                      )}
                    </div>
                    {type === "ivr" &&
                      isIVRBlock(localBlock) &&
                      !localBlock.responseType && (
                        <p className="text-sm text-muted-foreground">
                          Please select a response type first
                        </p>
                      )}
                    {type === "ivr" &&
                      isIVRBlock(localBlock) &&
                      localBlock.responseType === "speech" && (
                        <p className="text-sm text-muted-foreground">
                          Speech response type does not support options - will
                          record response and continue to next block
                        </p>
                      )}
                    {(type === "script" ||
                      (type === "ivr" &&
                        isIVRBlock(localBlock) &&
                        localBlock.responseType &&
                        localBlock.responseType !== "speech")) && (
                      <>
                        {localBlock.options?.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No options added - will continue to next block
                          </p>
                        )}
                        {localBlock.options?.map(
                          (option: BlockOption | IVROption, index: number) => (
                            <QuestionBlockOption
                              key={index}
                              option={option}
                              index={index}
                              onRemove={handleRemoveOption}
                              onChange={handleOptionChange}
                              onNextChange={handleNextChange}
                              pages={pages}
                              blocks={blocks}
                              type={type}
                            />
                          ),
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    )
  );
};

export default MergedQuestionBlock;
