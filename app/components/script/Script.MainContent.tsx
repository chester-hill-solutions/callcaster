import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  updateBlock: (id: string, newBlockData: Partial<Block | IVRBlock>) => void;
  handleReorder: (
    draggedId: string,
    targetId: string,
    dropPosition: "top" | "bottom",
  ) => void;
  mediaNames: string[];
  addPage: () => void;
  addBlock: () => void;
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
  addPage,
  addBlock,
}: MainContentProps) {
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [pendingType, setPendingType] = useState<"script" | "ivr" | null>(null);

  const currentType = script?.type === "script" ? "script" : "ivr";

  const requestTypeChange = (nextType: "script" | "ivr") => {
    if (nextType === currentType) {
      return;
    }

    setPendingType(nextType);
    setIsTypeDialogOpen(true);
  };

  const confirmTypeChange = () => {
    if (!pendingType) {
      setIsTypeDialogOpen(false);
      return;
    }

    changeType(pendingType);
    setPendingType(null);
    setIsTypeDialogOpen(false);
  };

  const cancelTypeChange = () => {
    setPendingType(null);
    setIsTypeDialogOpen(false);
  };

  const currentPageData = currentPage ? scriptData.pages[currentPage] : null;
  const hasSections = Object.keys(scriptData.pages || {}).length > 0;

  return (
    <div className="w-3/4" style={{ width: "75%" }}>
      <div className="flex flex-col">
        <div className="flex justify-between">
          <FormField
            htmlFor="campaign-name"
            label="Script Name"
            className="max-w-md"
          >
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
            description={
              script?.type === "script" ? "Live Script" : "Recording/Synthetic"
            }
            className="gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Recording/Synthetic
              </span>
              <Switch
                id="campaign-type"
                checked={currentType === "script"}
                onCheckedChange={(checked) =>
                  requestTypeChange(checked ? "script" : "ivr")
                }
              />
              <span className="text-sm text-muted-foreground">Live Script</span>
            </div>
          </FormField>
        </div>
        {!hasSections && (
          <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-semibold">Start here: add a section</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Step 1 of 2. Sections organize your script. After this, you can
              add your first block.
            </p>
            <Button className="mt-4" onClick={addPage}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Section
            </Button>
          </div>
        )}
        {hasSections && !currentPage && (
          <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-semibold">
              Start here: pick a section
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a section from the sidebar to continue, or add a new one.
            </p>
            <Button className="mt-4" variant="outline" onClick={addPage}>
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          </div>
        )}
        {currentPage && (
          <>
            <div className="mt-4 flex items-end justify-between gap-3">
              <FormField
                htmlFor="section-name"
                label="Section name"
                description="Use a simple label like Intro, Questions, or Wrap Up."
              >
                <Input
                  id="section-name"
                  value={currentPageData?.title || ""}
                  type="text"
                  onChange={handleSectionNameChange}
                />
              </FormField>
              <div className="mb-1 flex items-center gap-2">
                <Button onClick={addBlock}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add block
                </Button>
                <Button
                  onClick={() => removeSection(currentPage)}
                  variant="ghost"
                  size="sm"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete section
                </Button>
              </div>
            </div>
          </>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {currentPage && currentPageData?.blocks.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm font-medium">
                Start here: add your first block
              </p>
              <p className="text-sm text-muted-foreground">
                We will open it with starter text so you can edit and keep
                going.
              </p>
              <Button className="mt-3" onClick={addBlock}>
                <Plus className="mr-2 h-4 w-4" />
                Add first block
              </Button>
            </div>
          )}
          {currentPage &&
            currentPageData?.blocks.map((blockId: string) => {
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
      <Dialog
        open={isTypeDialogOpen}
        onOpenChange={(open) => !open && cancelTypeChange()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch script type?</DialogTitle>
            <DialogDescription>
              Changing between Live Script and Recording/Synthetic can require
              reworking block settings, options, and response behavior.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelTypeChange}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmTypeChange}>
              Switch Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
