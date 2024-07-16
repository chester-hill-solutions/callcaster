import React, { useState, useEffect } from "react";
import { ArrowDown, ArrowUp, Trash2, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { TextInput } from "./Inputs";
import { NavLink } from "@remix-run/react";
import { MdAdd, MdDialpad } from "react-icons/md";
import { EditResponseModal } from "./QuestionCard.ResponseTable.EditModal";
import { SelectGroup, SelectLabel } from "@radix-ui/react-select";

const QuestionBlockOption = ({
  option,
  index,
  onRemove,
  onChange,
  onNextChange,
  pages,
  blocks,
  type,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSave = (input) => {
    onChange(index, { ...option, value: input });
    setIsModalOpen(false);
  };

  return (
    <div className="mb-2 flex items-center space-x-2">
      {type === "ivr" ? (
        <div className="flex flex-col">
          <p>Input</p>
          <div
            className="flex h-10 w-[100px] items-center justify-between rounded-md border border-input bg-background bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent [&>span]:line-clamp-1"
            onClick={() => setIsModalOpen(!isModalOpen)}
          >
            {option.value === "vx-any" ? "Voice - Any" : option.value}
            <MdDialpad />
          </div>
          <EditResponseModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSave}
            initialInput={option.value}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          <p>Input</p>
          <TextInput
            value={option.content}
            onChange={(e) =>
              onChange(index, { ...option, content: e.target.value })
            }
            placeholder="Option content"
          />
        </div>
      )}
      <div className="flex flex-col">
        <p>Input</p>
        <div className="flex">
          <Select
            value={option.next}
            onValueChange={(value) => onNextChange(index, value)}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select next step" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(pages).map(([pageId, page]) => (
                <SelectGroup key={pageId}>
                  <SelectLabel>{page.title}</SelectLabel>
                  <SelectItem value={pageId}>Go to {page.title}</SelectItem>
                  {page?.blocks?.map((blockId) => (
                    <SelectItem key={blockId} value={`${pageId}:${blockId}`}>
                      {blocks[blockId].title || `Block ${blockId}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              <SelectGroup>
                <SelectLabel>Special Actions</SelectLabel>
                <SelectItem value="hangup">Hang Up</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>{" "}
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localBlock, setLocalBlock] = useState(block);

  const questionTypes =
    type === "script"
      ? [
          { value: "textarea", label: "Text Input" },
          { value: "infotext", label: "Static Text" },
          { value: "radio", label: "Radio" },
          { value: "dropdown", label: "Dropdown" },
          { value: "boolean", label: "Boolean" },
          { value: "multi", label: "Multi-Select" },
        ]
      : [
          { value: "synthetic", label: "Synthetic" },
          { value: "recorded", label: "Audio File" },
        ];

  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  const handleChange = (field, value) => {
    
    const updatedBlock = { ...localBlock, [field]: value, ...(field === 'content' && {"value": value.toLowerCase()}) };
    console.log(localBlock, updatedBlock);
    setLocalBlock(updatedBlock);
    onUpdate(updatedBlock);
  };

  const handleOptionChange = (index, newOption) => {
    const newOptions = [...localBlock.options];
    newOptions[index] = newOption;
    handleChange("options", newOptions);
  };

  const handleNextChange = (index, value) => {
    const newOptions = localBlock.options.map((opt, i) => {
      if (i !== index) return opt;
      return { ...opt, next: value };
    });
    handleChange("options", newOptions);
  };

  const handleAddOption = () => {
    const newOptions = [
      ...localBlock.options,
      { content: "", next: "", value: type === "ivr" ? "vx-any" : "" },
    ];
    handleChange("options", newOptions);
  };

  const handleRemoveOption = (index) => {
    const newOptions = localBlock.options.filter((_, i) => i !== index);
    handleChange("options", newOptions);
  };

  const renderContentInput = () => {
    if (type === "script" || localBlock.type === "synthetic") {
      return (
        <textarea
          value={localBlock.content || localBlock.audioFile}
          onChange={(e) =>
            handleChange(
              type === "script" ? "content" : "audioFile",
              e.target.value,
            )
          }
          placeholder={
            type === "script"
              ? "Your script or question"
              : "Your synthetic greeting"
          }
          rows={Math.max(
            3,
            Math.ceil(
              (localBlock?.content?.length ||
                localBlock?.audioFile?.length ||
                1) / 40,
            ),
          )}
          className="w-full resize-none rounded-md border bg-white p-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
        />
      );
    } else if (localBlock.type === "recorded") {
      return (
        <div className="flex gap-2">
          <Select
            value={localBlock.audioFile}
            onValueChange={(value) => handleChange("audioFile", value)}
          >
            <SelectTrigger className="bg-white dark:bg-transparent">
              <SelectValue
                className="text-brand-primary"
                placeholder="Select an audio file"
              />
            </SelectTrigger>
            <SelectContent>
              {mediaNames.map((media) => (
                <SelectItem key={media.id} value={media.name}>
                  {media.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" asChild>
            <NavLink to={"../../../../audios"} relative="path">
              <MdAdd size={24} />
            </NavLink>
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle
            className="w-full cursor-pointer"
            onClick={() => setIsOpen(!isOpen)}
          >
            {localBlock.title || `Block ${localBlock.id}`}
          </CardTitle>
          <div className="flex items-center space-x-2">
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
      {isOpen && (
        <CardContent>
          <div className="space-y-4">
            <TextInput
              value={localBlock.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="Block Title"
            />
            <Select
              value={localBlock.type}
              onValueChange={(value) => handleChange("type", value)}
            >
              <SelectTrigger className="bg-white dark:bg-transparent">
                <SelectValue
                  className="text-brand-primary"
                  placeholder="Select block type"
                />
              </SelectTrigger>
              <SelectContent>
                {questionTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderContentInput()}
          </div>
          {["radio", "dropdown", "multi", "synthetic", "recorded"].includes(
            localBlock.type,
          ) && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Options</h3>
                <Button variant="ghost" size="sm" onClick={handleAddOption}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Option
                </Button>
              </div>
              {localBlock.options?.map((option, index) => (
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
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default MergedQuestionBlock;
