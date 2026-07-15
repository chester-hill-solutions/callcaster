import type {
  ScriptBlock,
  ScriptDocument,
  ScriptOption,
  ScriptPage,
  ScriptPalette,
} from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";
import { useScriptEditorState } from "../hooks/use-script-editor-state.js";

export type ScriptEditorProps = {
  document: ScriptDocument;
  onChange: (doc: ScriptDocument) => void;
  palette?: ScriptPalette;
  readOnly?: boolean;
  mediaNames?: string[];
};

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
        {Object.values(editor.document.pages).map((page: ScriptPage) => (
          <ui.Button
            key={page.id}
            onClick={() => editor.setActivePageId(page.id)}
            disabled={readOnly && page.id !== editor.activePageId}
          >
            {page.title}
          </ui.Button>
        ))}
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

        {editor.activePage?.blockIds.map((blockId: string) => {
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
                onChange={(patch) => editor.updateBlock(blockId, patch)}
                onRemove={() => editor.removeBlock(blockId)}
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
  onChange: (patch: Partial<ScriptBlock>) => void;
  onRemove: () => void;
};

function BlockEditor({
  block,
  readOnly,
  mediaNames,
  onChange,
  onRemove,
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
      {options.length > 0 ||
      block.type === "choice" ||
      block.type === "select" ||
      block.type === "radio" ||
      block.type === "checkbox" ? (
        <ui.Field label="Options (comma-separated value:label)">
          <ui.Textarea
            value={options.map((o) => `${o.value}:${o.label}`).join("\n")}
            readOnly={readOnly}
            onChange={(raw) => {
              onChange({
                options: mergeEditedOptions(raw, options),
              } as Partial<ScriptBlock>);
            }}
          />
        </ui.Field>
      ) : null}
      {options.map((option, index) => (
        <ui.Field
          key={`${option.value}-${index}`}
          label={`Next target for ${option.label}`}
        >
          <ui.Input
            value={option.next ?? ""}
            placeholder="Page/block ID or hangup"
            readOnly={readOnly}
            onChange={(next) =>
              onChange({
                options: options.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, next: next || undefined }
                    : candidate,
                ),
              } as Partial<ScriptBlock>)
            }
          />
        </ui.Field>
      ))}
      {!readOnly && <ui.Button onClick={onRemove}>Remove block</ui.Button>}
    </div>
  );
}

export function mergeEditedOptions(
  raw: string,
  existingOptions: ScriptOption[],
): ScriptOption[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separatorIndex = line.indexOf(":");
      const value =
        separatorIndex === -1
          ? line.trim()
          : line.slice(0, separatorIndex).trim();
      const label =
        separatorIndex === -1
          ? value
          : line.slice(separatorIndex + 1).trim() || value;
      const existing =
        existingOptions.find((option) => option.value === value) ??
        existingOptions[index];

      return {
        ...existing,
        value,
        label,
        ...(existing?.content !== undefined ? { content: label } : {}),
      };
    });
}
