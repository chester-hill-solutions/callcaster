import React, { useState, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput as Input } from "@/components/forms/Inputs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Page, IVROption, IVRBlock } from "@/lib/types";
import { AddIcon } from "@/components/shared/Icons";
import {
  MdAdd,
  MdAddCircle,
  MdAddCircleOutline,
  MdDialpad,
  MdRemove,
} from "react-icons/md";
import { NavLink } from "@remix-run/react";
import { EditResponseModal } from "@/components/question/QuestionCard.ResponseTable.EditModal";
const questionTypes = [
  { value: "synthetic", label: "Synthetic" },
  { value: "recorded", label: "Audio File" },
];

type AudioFile = {
  created_at: Date;
  id: string;
  last_accessed_at: Date;
  metadata: Record<string, unknown> | null;
  name: string;
  updated_at: Date;
};

const IVRQuestionBlockOption = ({
  option,
  index,
  onRemove,
  onChange,
  onNextChange,
  pages,
}: {
  option: IVROption;
  index: number;
  onRemove: (index: number) => void;
  onChange: (index: number, option: IVROption) => void;
  onNextChange: (index: number, value: string) => void;
  pages: Page[];
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSave = (input: "vx-any" | number) => {
    onChange(index, { ...option, value: input });
    setIsModalOpen(false);
  };

  return (
    <>
      <EditResponseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialInput={option.value}
      />
      <div className="mb-2 flex items-center space-x-2">
        <div className="flex flex-col">
          <p>Input</p>
          <div
            className="flex h-10 w-[100px] items-center justify-between rounded-md border border-input bg-background bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent [&>span]:line-clamp-1"
            onClick={() => setIsModalOpen(!isModalOpen)}
          >
            {option.value === "vx-any" ? "Voice - Any" : option.value}
            <MdDialpad />
          </div>
        </div>
        <div className="flex w-full flex-col">
          <p>Next Step</p>
          <div className="flex flex-1">
            <Select
              value={option.next}
              onValueChange={(value) => onNextChange(index, value)}
            >
              <SelectTrigger className="bg-white dark:bg-transparent">
                <SelectValue
                  className="text-brand-primary"
                  placeholder="Select an audio file"
                />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(pages).map(([pageId, page]) => {
                  return (
                    <SelectItem key={pageId} value={pageId}>
                      {page.title}
                    </SelectItem>
                  );
                })}
                <SelectItem value={"hangup"}>Hang Up</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
              <MdRemove size={24} className="text-primary" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

const IVRQuestionBlock = ({
  block,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  pages,
  isOpen,
  onToggle,
  mediaNames,
}: {
  block: IVRBlock;
  onUpdate: (block: IVRBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  pages: Page[];
  isOpen: boolean;
  onToggle: () => void;
  mediaNames: AudioFile[];
}) => {
  const [localBlock, setLocalBlock] = useState(block);

  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  const handleChange = (field: keyof IVRBlock, value: string | IVROption[] | "recorded" | "synthetic" | "dtmf" | "speech" | "dtmf speech" | null) => {
    const updatedBlock = { ...localBlock, [field]: value };
    setLocalBlock(updatedBlock);
    onUpdate(updatedBlock);
  };

  const handleNextChange = (index: number, value: string) => {
    const newOptions = localBlock.options.map((opt, i) => {
      if (i !== index) return opt;
      return {
        ...opt,
        next: value,
      };
    });
    handleChange("options", newOptions as IVROption[]);
  };

  const handleOptionChange = (index: number, newOption: IVROption) => {
    const newOptions = [...localBlock.options];
    newOptions[index] = newOption;
    handleChange("options", newOptions as IVROption[]);
  };

  const handleAddOption = () => {
    const newOptions = [...localBlock.options, { content: "", next: "" }];
    handleChange("options", newOptions as IVROption[]);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = localBlock.options.filter((_, i) => i !== index);
    handleChange("options", newOptions as IVROption[]);
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="w-full" onClick={onToggle}>
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
            <Input
              name="title"
              value={localBlock.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="Block Title"
              className=""
              disabled={false}
            />
            <Select
              value={localBlock.speechType}
              onValueChange={(value) => handleChange("speechType", value)}
            >
              <SelectTrigger className="bg-white dark:bg-transparent">
                <SelectValue
                  className="text-brand-primary"
                  placeholder="Select an audio type"
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
            {localBlock.speechType === "synthetic" && (
              <textarea
                value={localBlock.audioFile}
                onChange={(e) => handleChange("audioFile", e.target.value)}
                placeholder="Your synthetic greeting"
                rows={Math.max(3, Math.ceil((localBlock?.audioFile || 1) / 40))}
                className="w-full resize-none rounded-md border bg-white p-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            )}
            {localBlock.speechType === "recorded" && (
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
            )}
          </div>
          <div className="pt-4">
            <div className="flex items-center gap-2">
              <h3>Responses</h3>
              <Button variant={"ghost"} onClick={() => handleAddOption()}>
                <MdAddCircleOutline />
              </Button>{" "}
            </div>
            {localBlock.options.map((option, index) => (
              <IVRQuestionBlockOption
                key={option.id}
                option={option}
                index={index}
                onRemove={handleRemoveOption}
                onChange={handleOptionChange}
                onNextChange={handleNextChange}
                pages={pages}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default IVRQuestionBlock;
