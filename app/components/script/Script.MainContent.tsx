import React from "react";
import { MdRemoveCircleOutline } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import MergedQuestionBlock from "@/components/script/ScriptBlock";
import { Block, Flow, IVRBlock, Script } from "@/lib/types";

type MainContentProps = {
  script: Script;
  scriptData: Flow;
  currentPage: string | null;
  openBlock: string | null;
  setOpenBlock: (blockId: string | null) => void;
  handleTitle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  changeType: (newType: "script" | "ivr") => void;
  handleSectionNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeSection: (id: string) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, direction: number) => void;
  updateBlock: (
    id: string,
    newBlockData: Partial<Block | IVRBlock>,
  ) => void;
  handleReorder: (
    draggedId: string,
    targetId: string,
    dropPosition: "top" | "bottom",
  ) => void;
  mediaNames: string[];
};

export default function ScriptMainContent({
  script,
  scriptData,
  currentPage,
  openBlock,
  setOpenBlock,
  handleTitle,
  changeType,
  handleSectionNameChange,
  removeSection,
  removeBlock,
  moveBlock,
  updateBlock,
  handleReorder,
  mediaNames,
}: MainContentProps) {
  return (
    <div className="w-3/4" style={{ width: "75%" }}>
      <div className="flex flex-col">
        <div className="flex justify-between">
          <FormField htmlFor="campaign-name" label="Script Name" className="max-w-md">
            <Input
              id="campaign-name"
              value={script?.name || ""}
              type="text"
              onChange={handleTitle}
            />
          </FormField>
          <FormField
            htmlFor="campaign-type"
            label="Script Type"
            description={script?.type === "script" ? "Live Script" : "Recording/Synthetic"}
            className="gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Recording/Synthetic</span>
              <Switch
                id="campaign-type"
                checked={script?.type === "script"}
                onCheckedChange={(checked) => changeType(checked ? "script" : "ivr")}
              />
              <span className="text-sm text-muted-foreground">Live Script</span>
            </div>
          </FormField>
        </div>
        {currentPage && (
          <>
            <div className="mt-4">
              <FormField htmlFor="section-name" label="Section Name">
                <Input
                  id="section-name"
                  value={scriptData.pages[currentPage]?.title || ""}
                  type="text"
                  onChange={handleSectionNameChange}
                />
              </FormField>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => removeSection(currentPage)} variant="ghost" size="icon">
                <MdRemoveCircleOutline />
              </Button>
            </div>
          </>
        )}
        <div className="flex flex-col gap-2">
          {currentPage &&
            scriptData.pages[currentPage]?.blocks.map((blockId: string) => {
              const block = scriptData.blocks[blockId];
              if (!block) {
                return null;
              }
              return (
                <MergedQuestionBlock
                  key={blockId}
                  type={script.type === "ivr" ? "ivr" : "script"}
                  pages={scriptData.pages}
                  blocks={scriptData.blocks}
                  block={block}
                  onRemove={() => removeBlock(blockId)}
                  onMoveUp={() => moveBlock(blockId, -1)}
                  onMoveDown={() => moveBlock(blockId, 1)}
                  onUpdate={(newState) => updateBlock(blockId, newState)}
                  openBlock={openBlock}
                  setOpenBlock={setOpenBlock}
                  onReorder={handleReorder}
                  mediaNames={mediaNames}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
