import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Block, BlockOption, IVRBlock, IVROption } from "@/lib/types";
import { ScriptBlockQuestionOption } from "@/components/script/ScriptBlock.QuestionOption";

type ScriptEditorBlock = Block | IVRBlock;

function isIVRBlock(block: ScriptEditorBlock): block is IVRBlock {
  return (
    "speechType" in block && "audioFile" in block && "responseType" in block
  );
}

type ScriptBlockContentInputProps = {
  block: ScriptEditorBlock;
  type: "script" | "ivr";
  mediaNames: string[];
  onChange: (
    field: keyof Block | keyof IVRBlock,
    value: string | BlockOption[] | IVROption[],
  ) => void;
};

export function ScriptBlockContentInput({
  block,
  type,
  mediaNames,
  onChange,
}: ScriptBlockContentInputProps) {
  if (type === "script") {
    return (
      <Textarea
        value={block.content}
        onChange={(e) => onChange("content", e.target.value)}
        placeholder="Your script or question"
        className="min-h-[100px] bg-white"
      />
    );
  }

  if (!isIVRBlock(block)) {
    return null;
  }

  if (block.speechType === "synthetic") {
    return (
      <Textarea
        value={block.audioFile}
        onChange={(e) => onChange("audioFile", e.target.value)}
        placeholder="Your synthetic greeting"
        className="min-h-[100px] bg-white"
      />
    );
  }

  if (block.speechType === "recorded") {
    return (
      <div className="flex gap-2">
        <Select
          value={block.audioFile}
          onValueChange={(value) => onChange("audioFile", value)}
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
}

type ScriptBlockOptionsSectionProps = {
  block: ScriptEditorBlock;
  type: "script" | "ivr";
  pages: Record<string, { id: string; title: string; blocks: string[] }>;
  blocks: Record<string, ScriptEditorBlock>;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  onOptionChange: (index: number, option: BlockOption | IVROption) => void;
  onNextChange: (index: number, value: string) => void;
};

export function ScriptBlockOptionsSection({
  block,
  type,
  pages,
  blocks,
  onAddOption,
  onRemoveOption,
  onOptionChange,
  onNextChange,
}: ScriptBlockOptionsSectionProps) {
  const showOptions =
    (type === "script" &&
      ["radio", "dropdown", "multi"].includes(block.type)) ||
    type === "ivr";

  if (!showOptions) {
    return null;
  }

  const ivrBlock = isIVRBlock(block) ? block : null;

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Options</h3>
          {(type === "script" ||
            (type === "ivr" &&
              ivrBlock?.responseType &&
              ivrBlock.responseType !== "speech")) && (
            <Button
              variant="outline"
              size="sm"
              className="border-primary"
              onClick={onAddOption}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Option
            </Button>
          )}
        </div>
        {type === "ivr" && ivrBlock && !ivrBlock.responseType && (
          <p className="text-sm text-muted-foreground">
            Please select a response type first
          </p>
        )}
        {type === "ivr" && ivrBlock?.responseType === "speech" && (
          <p className="text-sm text-muted-foreground">
            Speech response type does not support options - will record response
            and continue to next block
          </p>
        )}
        {(type === "script" ||
          (type === "ivr" &&
            ivrBlock?.responseType &&
            ivrBlock.responseType !== "speech")) && (
          <>
            {block.options?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No options added - will continue to next block
              </p>
            )}
            {block.options?.map((option: BlockOption | IVROption, index) => (
              <ScriptBlockQuestionOption
                key={index}
                option={option}
                index={index}
                onRemove={onRemoveOption}
                onChange={onOptionChange}
                onNextChange={onNextChange}
                pages={pages}
                blocks={blocks}
                type={type}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
