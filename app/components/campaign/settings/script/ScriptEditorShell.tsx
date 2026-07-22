import { useId, useState } from "react";
import type {
  ScriptBlock,
  ScriptDocument,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import { useScriptEditorState } from "@chester-hill-solutions/scriptkit-call-script-react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ScriptBlockEditor } from "./ScriptBlockEditor";

const BLOCK_TYPE_LABELS: Record<string, string> = {
  instruction: "Instruction",
  textarea: "Text area",
  select: "Select",
  radio: "Radio",
  checkbox: "Checkbox",
};

export type ScriptEditorShellProps = {
  document: ScriptDocument;
  onChange: (doc: ScriptDocument) => void;
  mediaNames?: string[];
  readOnly?: boolean;
  className?: string;
};

export function ScriptEditorShell({
  document,
  onChange,
  mediaNames = [],
  readOnly = false,
  className,
}: ScriptEditorShellProps) {
  const jumpSelectId = useId();
  const addBlockSelectId = useId();
  const [addBlockKey, setAddBlockKey] = useState(0);

  const editor = useScriptEditorState({
    initialDocument: document,
    palette: "callcaster",
    onChange,
  });

  const activePageIndex = editor.orderedPages.findIndex(
    (page) => page.id === editor.activePageId,
  );
  const pageCount = editor.orderedPages.length;
  const isStartPage =
    editor.activePageId === editor.document.startPageId;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="sm:hidden">
        <FormField label="Jump to page" htmlFor={jumpSelectId}>
          <Select
            value={editor.activePageId}
            onValueChange={(pageId) => editor.setActivePageId(pageId)}
          >
            <SelectTrigger id={jumpSelectId}>
              <SelectValue placeholder="Select a page…" />
            </SelectTrigger>
            <SelectContent>
              {editor.orderedPages.map((page) => (
                <SelectItem key={page.id} value={page.id}>
                  {page.title}
                  {page.id === editor.document.startPageId ? " (start)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
        <aside
          className="hidden sm:flex sm:flex-col sm:gap-2 sm:self-start sm:sticky sm:top-4"
          aria-label="Script pages"
        >
          <p className="text-[0.65rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Pages
          </p>
          <nav className="flex flex-col gap-1">
            {editor.orderedPages.map((page) => {
              const selected = page.id === editor.activePageId;
              const isStart = page.id === editor.document.startPageId;
              return (
                <button
                  key={page.id}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-left text-xs leading-snug transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                  )}
                  onClick={() => editor.setActivePageId(page.id)}
                >
                  {page.title}
                  {isStart ? " (start)" : ""}
                </button>
              );
            })}
          </nav>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="hidden sm:inline-flex"
              onClick={() => editor.addPage()}
            >
              Add page
            </Button>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {editor.activePage ? (
            <>
              <div className="space-y-3 rounded-md border border-border bg-card p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <LabelledPageTitle
                    value={editor.activePage.title}
                    readOnly={readOnly}
                    onChange={(title) =>
                      editor.renamePage(editor.activePageId, title)
                    }
                  />
                  <div className="flex flex-wrap gap-1">
                    {!readOnly && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="sm:hidden"
                          onClick={() => editor.addPage()}
                        >
                          Add page
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Move page up"
                          disabled={activePageIndex <= 0}
                          onClick={() =>
                            editor.movePage(
                              editor.activePageId,
                              activePageIndex - 1,
                            )
                          }
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Move page down"
                          disabled={
                            activePageIndex < 0 ||
                            activePageIndex >= pageCount - 1
                          }
                          onClick={() =>
                            editor.movePage(
                              editor.activePageId,
                              activePageIndex + 1,
                            )
                          }
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isStartPage}
                          onClick={() =>
                            editor.setStartPage(editor.activePageId)
                          }
                        >
                          Set as start
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label="Remove page"
                          disabled={pageCount <= 1}
                          onClick={() =>
                            editor.removePage(editor.activePageId)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {!readOnly && (
                  <FormField label="Add block" htmlFor={addBlockSelectId}>
                    <Select
                      key={addBlockKey}
                      onValueChange={(type) => {
                        editor.addBlock(type as ScriptBlock["type"]);
                        setAddBlockKey((key) => key + 1);
                      }}
                    >
                      <SelectTrigger id={addBlockSelectId}>
                        <SelectValue placeholder="Choose type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {editor.blockTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {BLOCK_TYPE_LABELS[type] ?? type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              </div>

              <div className="space-y-3">
                {editor.activePage.blockIds.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
                    Add a block to this page.
                  </p>
                ) : (
                  editor.activePage.blockIds.map((blockId, index) => {
                    const block = editor.document.blocks[blockId];
                    if (!block) {
                      return null;
                    }
                    const active = editor.activeBlockId === blockId;
                    return (
                      <div
                        key={blockId}
                        className={cn(
                          "rounded-md border bg-card p-3 sm:p-4 transition-colors",
                          active
                            ? "border-primary"
                            : "border-border hover:border-muted-foreground/40",
                        )}
                        onClick={() => editor.setActiveBlockId(blockId)}
                      >
                        <ScriptBlockEditor
                          block={block}
                          readOnly={readOnly}
                          mediaNames={mediaNames}
                          routingTargets={editor.routingTargets}
                          onChange={(patch) =>
                            editor.updateBlock(blockId, patch)
                          }
                          onRemove={() => editor.removeBlock(blockId)}
                          onDuplicate={() => editor.duplicateBlock(blockId)}
                          onMoveUp={() =>
                            editor.moveBlock(blockId, index - 1)
                          }
                          onMoveDown={() =>
                            editor.moveBlock(blockId, index + 1)
                          }
                          onOptionAdd={() => editor.addOption(blockId)}
                          onOptionChange={(optionId, patch) =>
                            editor.updateOption(blockId, optionId, patch)
                          }
                          onOptionRemove={(optionId) =>
                            editor.removeOption(blockId, optionId)
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
              Select a page from the list.
            </p>
          )}

        </div>
      </div>

      {!editor.validation.ok && (
        <div className="text-sm text-destructive" role="alert">
          {editor.validation.errors.join("; ")}
        </div>
      )}
    </div>
  );
}

function LabelledPageTitle({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-[12rem] flex-1 gap-2 font-normal">
      <span className="text-sm font-medium">Page title</span>
      <Input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
