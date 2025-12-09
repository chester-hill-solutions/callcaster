import React from "react";
import { MdRemoveCircleOutline } from "react-icons/md";
import { Button } from "~/components/ui/button";
import { Toggle } from "~/components/forms/Inputs";
import MergedQuestionBlock from "~/components/script/ScriptBlock";
import { Script } from "~/lib/types";

type MainContentProps = {
  script: Script;
  scriptData: Script["steps"];
  currentPage: string | null;
  openBlock: string | null;
  setOpenBlock: (blockId: string | null) => void;
  handleTitle: (event: React.ChangeEvent<HTMLInputElement>) => void;
  changeType: (newType: string) => void;
  handleSectionNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeSection: (id: string) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, direction: number) => void;
  updateBlock: (
    id: string,
    newBlockData: Partial<Script["steps"]["blocks"][string]>,
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
          <div className="flex flex-col">
            <label htmlFor="campaign-name">Script Name</label>
            <input
              id="campaign-name"
              value={script?.name || ""}
              type="text"
              onChange={handleTitle}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Toggle
              name="campaign-type"
              label="Script Type"
              isChecked={script?.type === "script"}
              leftLabel="Recording/Synthetic"
              rightLabel="Live Script"
              onChange={(val) => changeType(val ? "script" : "ivr")}
            />
          </div>
        </div>
        {currentPage && (
          <>
            <label htmlFor="section-name" className="mt-4">
              Section Name
            </label>
            <div className="flex gap-2">
              <input
                id="section-name"
                value={scriptData.pages[currentPage]?.title || ""}
                type="text"
                onChange={handleSectionNameChange}
                className="mb-4"
              />
              <Button onClick={() => removeSection(currentPage)} variant="icon">
                <MdRemoveCircleOutline />
              </Button>
            </div>
          </>
        )}
        <div className="flex flex-col gap-2">
          {currentPage &&
            scriptData.pages[currentPage]?.blocks.map((blockId: string) => {
              return (
                <MergedQuestionBlock
                  key={blockId}
                  type={script.type}
                  pages={scriptData.pages}
                  blocks={scriptData.blocks}
                  block={scriptData.blocks[blockId] || {}}
                  onRemove={() => removeBlock(blockId)}
                  moveUp={() => moveBlock(blockId, -1)}
                  moveDown={() => moveBlock(blockId, 1)}
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
