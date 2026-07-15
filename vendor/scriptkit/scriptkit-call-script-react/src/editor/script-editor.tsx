import type {
  ScriptBlock,
  ScriptDocument,
  ScriptOption,
  ScriptPage,
  ScriptPalette,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";
import {
  useScriptEditorState,
  type RoutingTarget,
} from "../hooks/use-script-editor-state.js";

export type ScriptEditorProps = {
  document: ScriptDocument;
  onChange: (doc: ScriptDocument) => void;
  palette?: ScriptPalette;
  readOnly?: boolean;
  mediaNames?: string[];
};

/** Stands in for "no routing target"; see routingOptions below. */
const NO_ROUTING_TARGET = "__none__";

/**
 * Reference editor for the headless state in `useScriptEditorState`.
 *
 * Deliberately plain: it injects its controls via `useCallScriptUi` so a host
 * app can supply its own design system. Hosts wanting a first-class builder
 * should consume the hook directly rather than restyle this.
 */
export function ScriptEditor({
  document,
  onChange,
  palette = "callcaster",
  readOnly = false,
  mediaNames = [],
}: ScriptEditorProps) {
  const ui = useCallScriptUi();
  const editor = useScriptEditorState({
    initialDocument: document,
    palette,
    onChange,
  });

  return (
    <div className="call-script-root call-script-editor">
      <aside className="call-script-pages">
        <p className="call-script-muted">Pages</p>
        {editor.orderedPages.map((page: ScriptPage, index: number) => (
          <div key={page.id} className="call-script-page-row">
            <ui.Button
              onClick={() => editor.setActivePageId(page.id)}
              disabled={readOnly && page.id !== editor.activePageId}
            >
              {page.title}
              {page.id === editor.document.startPageId ? " (start)" : ""}
            </ui.Button>
            {!readOnly && (
              <>
                <ui.Button onClick={() => editor.movePage(page.id, index - 1)}>
                  Move up
                </ui.Button>
                <ui.Button onClick={() => editor.movePage(page.id, index + 1)}>
                  Move down
                </ui.Button>
                <ui.Button onClick={() => editor.setStartPage(page.id)}>
                  Set as start
                </ui.Button>
                <ui.Button onClick={() => editor.removePage(page.id)}>
                  Remove page
                </ui.Button>
              </>
            )}
          </div>
        ))}
        {!readOnly && <ui.Button onClick={() => editor.addPage()}>Add page</ui.Button>}
      </aside>

      <section>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          {editor.activePage && !readOnly && (
            <ui.Field label="Page title">
              <ui.Input
                value={editor.activePage.title}
                onChange={(value) =>
                  editor.renamePage(editor.activePageId, value)
                }
              />
            </ui.Field>
          )}
          {editor.blockTypes.map((type) => (
            <ui.Button
              key={type}
              onClick={() => editor.addBlock(type as ScriptBlock["type"])}
              disabled={readOnly}
            >
              Add {type}
            </ui.Button>
          ))}
        </div>

        {editor.activePage?.blockIds.map((blockId: string, index: number) => {
          const block = editor.document.blocks[blockId];
          if (!block) {
            return null;
          }
          const active = editor.activeBlockId === blockId;
          return (
            <div
              key={blockId}
              className={`call-script-block${active ? " call-script-block--active" : ""}`}
              onClick={() => editor.setActiveBlockId(blockId)}
            >
              <BlockEditor
                block={block}
                readOnly={readOnly}
                mediaNames={mediaNames}
                routingTargets={editor.routingTargets}
                onChange={(patch) => editor.updateBlock(blockId, patch)}
                onRemove={() => editor.removeBlock(blockId)}
                onDuplicate={() => editor.duplicateBlock(blockId)}
                onMoveUp={() => editor.moveBlock(blockId, index - 1)}
                onMoveDown={() => editor.moveBlock(blockId, index + 1)}
                onOptionAdd={() => editor.addOption(blockId)}
                onOptionChange={(optionId, patch) =>
                  editor.updateOption(blockId, optionId, patch)
                }
                onOptionRemove={(optionId) => editor.removeOption(blockId, optionId)}
              />
            </div>
          );
        })}
      </section>

      {!editor.validation.ok && (
        <div className="call-script-muted" role="alert">
          {editor.validation.errors.join("; ")}
        </div>
      )}
    </div>
  );
}

type BlockEditorProps = {
  block: ScriptBlock;
  readOnly: boolean;
  mediaNames: string[];
  routingTargets: RoutingTarget[];
  onChange: (patch: Partial<ScriptBlock>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOptionAdd: () => void;
  onOptionChange: (optionId: string, patch: Partial<ScriptOption>) => void;
  onOptionRemove: (optionId: string) => void;
};

function BlockEditor({
  block,
  readOnly,
  mediaNames,
  routingTargets,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onOptionAdd,
  onOptionChange,
  onOptionRemove,
}: BlockEditorProps) {
  const ui = useCallScriptUi();

  const prompt = "prompt" in block ? (block.prompt ?? "") : "";
  const body = block.type === "instruction" ? block.body : "";
  const options = "options" in block && block.options ? block.options : [];
  const isIvrBlock =
    block.callcasterType === "recorded" ||
    block.callcasterType === "synthetic" ||
    block.callcasterType === "say" ||
    block.speechType !== undefined;
  const takesOptions =
    block.type === "choice" ||
    block.type === "select" ||
    block.type === "radio" ||
    block.type === "checkbox" ||
    options.length > 0;

  const routingOptions = [
    // Sentinel rather than "": host Select implementations (Radix, for one)
    // reject an empty-string item value, since that is how they represent
    // "nothing selected".
    { value: NO_ROUTING_TARGET, label: "(no target)" },
    ...routingTargets.map((target) => ({
      value: target.id,
      label:
        target.kind === "block"
          ? `${target.pageTitle} — ${target.label}`
          : target.label,
    })),
  ];

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>{block.type}</strong>
      {block.title !== undefined && (
        <ui.Field label="Title">
          <ui.Input
            value={block.title}
            readOnly={readOnly}
            onChange={(value) =>
              onChange({ title: value } as Partial<ScriptBlock>)
            }
          />
        </ui.Field>
      )}
      {block.type === "instruction" && (
        <ui.Field label="Body">
          <ui.Textarea
            value={body}
            readOnly={readOnly}
            onChange={(value) =>
              onChange({
                body: value,
                content: value,
              } as Partial<ScriptBlock>)
            }
          />
        </ui.Field>
      )}
      {block.type !== "instruction" && "prompt" in block && (
        <ui.Field label="Prompt">
          <ui.Textarea
            value={prompt}
            readOnly={readOnly}
            onChange={(value) =>
              onChange({
                prompt: value,
                content: value,
              } as Partial<ScriptBlock>)
            }
          />
        </ui.Field>
      )}
      {isIvrBlock && (
        <>
          <ui.Field label="IVR block type">
            <ui.Select
              value={block.callcasterType ?? "say"}
              readOnly={readOnly}
              options={[
                { value: "recorded", label: "Recorded audio" },
                { value: "synthetic", label: "Synthetic speech" },
                { value: "say", label: "Say" },
              ]}
              onChange={(value) =>
                onChange({ callcasterType: value } as Partial<ScriptBlock>)
              }
            />
          </ui.Field>
          {block.speechType !== undefined && (
            <ui.Field label="Speech type">
              <ui.Select
                value={block.speechType}
                readOnly={readOnly}
                options={[
                  { value: "recorded", label: "Recorded audio" },
                  { value: "synthetic", label: "Synthetic speech" },
                ]}
                onChange={(value) =>
                  onChange({ speechType: value } as Partial<ScriptBlock>)
                }
              />
            </ui.Field>
          )}
          <ui.Field
            label={
              block.callcasterType === "recorded" ? "Audio file" : "Speech text"
            }
          >
            {block.callcasterType === "recorded" && mediaNames.length > 0 ? (
              <ui.Select
                value={block.audioFile ?? ""}
                readOnly={readOnly}
                options={mediaNames.map((name) => ({
                  value: name,
                  label: name,
                }))}
                onChange={(value) =>
                  onChange({ audioFile: value } as Partial<ScriptBlock>)
                }
              />
            ) : (
              <ui.Textarea
                value={block.audioFile ?? ""}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({ audioFile: value } as Partial<ScriptBlock>)
                }
              />
            )}
          </ui.Field>
        </>
      )}
      {takesOptions && (
        <>
          {options.map((option, index) => (
            // Keyed by the option's stable id, not its index or value, so a row
            // isn't remounted (losing focus) while its value is being typed.
            <div key={option.id ?? index} style={{ display: "grid", gap: "0.25rem" }}>
              <ui.Field label="Option value">
                <ui.Input
                  value={option.value}
                  readOnly={readOnly}
                  onChange={(value) =>
                    onOptionChange(option.id ?? "", { value })
                  }
                />
              </ui.Field>
              <ui.Field label="Option label">
                <ui.Input
                  value={option.label}
                  readOnly={readOnly}
                  onChange={(label) =>
                    onOptionChange(option.id ?? "", { label, content: label })
                  }
                />
              </ui.Field>
              <ui.Field label="Next target">
                <ui.Select
                  // `||`, not `??`: legacy wire data stores "no target" as an
                  // empty string, which would otherwise select nothing at all.
                  value={option.next || NO_ROUTING_TARGET}
                  readOnly={readOnly}
                  options={routingOptions}
                  onChange={(next) =>
                    onOptionChange(option.id ?? "", {
                      next: next === NO_ROUTING_TARGET ? undefined : next,
                    })
                  }
                />
              </ui.Field>
              {!readOnly && (
                <ui.Button onClick={() => onOptionRemove(option.id ?? "")}>
                  Remove option
                </ui.Button>
              )}
            </div>
          ))}
          {!readOnly && <ui.Button onClick={onOptionAdd}>Add option</ui.Button>}
        </>
      )}
      {!readOnly && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <ui.Button onClick={onMoveUp}>Move up</ui.Button>
          <ui.Button onClick={onMoveDown}>Move down</ui.Button>
          <ui.Button onClick={onDuplicate}>Duplicate block</ui.Button>
          <ui.Button onClick={onRemove}>Remove block</ui.Button>
        </div>
      )}
    </div>
  );
}
