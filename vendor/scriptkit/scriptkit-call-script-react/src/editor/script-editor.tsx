import type { ScriptBlock, ScriptDocument, ScriptPage, ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";
import { useScriptEditorState } from "../hooks/use-script-editor-state.js";

export type ScriptEditorProps = {
  document: ScriptDocument;
  onChange: (doc: ScriptDocument) => void;
  palette?: ScriptPalette;
  readOnly?: boolean;
};

export function ScriptEditor({ document, onChange, palette = "callcaster", readOnly = false }: ScriptEditorProps) {
  const ui = useCallScriptUi();
  const editor = useScriptEditorState({ initialDocument: document, palette, onChange });

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
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {editor.blockTypes.map((type) => (
            <ui.Button key={type} onClick={() => editor.addBlock(type as ScriptBlock["type"])} disabled={readOnly}>
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
  onChange: (patch: Partial<ScriptBlock>) => void;
  onRemove: () => void;
};

function BlockEditor({ block, readOnly, onChange, onRemove }: BlockEditorProps) {
  const ui = useCallScriptUi();

  const prompt = "prompt" in block ? (block.prompt ?? "") : "";
  const body = block.type === "instruction" ? block.body : "";
  const options = "options" in block && block.options ? block.options : [];

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <strong>{block.type}</strong>
      {block.type === "instruction" && (
        <ui.Field label="Body">
          <ui.Textarea
            value={body}
            readOnly={readOnly}
            onChange={(value) => onChange({ body: value } as Partial<ScriptBlock>)}
          />
        </ui.Field>
      )}
      {block.type !== "instruction" && "prompt" in block && (
        <ui.Field label="Prompt">
          <ui.Textarea
            value={prompt}
            readOnly={readOnly}
            onChange={(value) => onChange({ prompt: value } as Partial<ScriptBlock>)}
          />
        </ui.Field>
      )}
      {options.length > 0 || block.type === "choice" || block.type === "select" || block.type === "radio" || block.type === "checkbox" ? (
        <ui.Field label="Options (comma-separated value:label)">
          <ui.Textarea
            value={options.map((o) => `${o.value}:${o.label}`).join("\n")}
            readOnly={readOnly}
            onChange={(raw) => {
              const nextOptions = raw
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [value, label] = line.split(":");
                  const v = value?.trim() ?? "";
                  return { value: v, label: (label ?? v).trim() };
                });
              onChange({ options: nextOptions } as Partial<ScriptBlock>);
            }}
          />
        </ui.Field>
      ) : null}
      {!readOnly && <ui.Button onClick={onRemove}>Remove block</ui.Button>}
    </div>
  );
}
