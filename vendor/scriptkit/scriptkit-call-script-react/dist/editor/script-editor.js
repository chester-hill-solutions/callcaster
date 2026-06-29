import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallScriptUi } from "../context.js";
import { useScriptEditorState } from "../hooks/use-script-editor-state.js";
export function ScriptEditor({ document, onChange, palette = "callcaster", readOnly = false }) {
    const ui = useCallScriptUi();
    const editor = useScriptEditorState({ initialDocument: document, palette, onChange });
    return (_jsxs("div", { className: "call-script-root call-script-editor", children: [_jsxs("aside", { className: "call-script-pages", children: [_jsx("p", { className: "call-script-muted", children: "Pages" }), Object.values(editor.document.pages).map((page) => (_jsx(ui.Button, { onClick: () => editor.setActivePageId(page.id), disabled: readOnly && page.id !== editor.activePageId, children: page.title }, page.id)))] }), _jsxs("section", { children: [_jsx("div", { style: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }, children: editor.blockTypes.map((type) => (_jsxs(ui.Button, { onClick: () => editor.addBlock(type), disabled: readOnly, children: ["Add ", type] }, type))) }), editor.activePage?.blockIds.map((blockId) => {
                        const block = editor.document.blocks[blockId];
                        if (!block) {
                            return null;
                        }
                        const active = editor.activeBlockId === blockId;
                        return (_jsx("div", { className: `call-script-block${active ? " call-script-block--active" : ""}`, onClick: () => editor.setActiveBlockId(blockId), children: _jsx(BlockEditor, { block: block, readOnly: readOnly, onChange: (patch) => editor.updateBlock(blockId, patch), onRemove: () => editor.removeBlock(blockId) }) }, blockId));
                    })] }), !editor.validation.ok && (_jsx("div", { className: "call-script-muted", role: "alert", children: editor.validation.errors.join("; ") }))] }));
}
function BlockEditor({ block, readOnly, onChange, onRemove }) {
    const ui = useCallScriptUi();
    const prompt = "prompt" in block ? (block.prompt ?? "") : "";
    const body = block.type === "instruction" ? block.body : "";
    const options = "options" in block && block.options ? block.options : [];
    return (_jsxs("div", { style: { display: "grid", gap: "0.5rem" }, children: [_jsx("strong", { children: block.type }), block.type === "instruction" && (_jsx(ui.Field, { label: "Body", children: _jsx(ui.Textarea, { value: body, readOnly: readOnly, onChange: (value) => onChange({ body: value }) }) })), block.type !== "instruction" && "prompt" in block && (_jsx(ui.Field, { label: "Prompt", children: _jsx(ui.Textarea, { value: prompt, readOnly: readOnly, onChange: (value) => onChange({ prompt: value }) }) })), options.length > 0 || block.type === "choice" || block.type === "select" || block.type === "radio" || block.type === "checkbox" ? (_jsx(ui.Field, { label: "Options (comma-separated value:label)", children: _jsx(ui.Textarea, { value: options.map((o) => `${o.value}:${o.label}`).join("\n"), readOnly: readOnly, onChange: (raw) => {
                        const nextOptions = raw
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => {
                            const [value, label] = line.split(":");
                            const v = value?.trim() ?? "";
                            return { value: v, label: (label ?? v).trim() };
                        });
                        onChange({ options: nextOptions });
                    } }) })) : null, !readOnly && _jsx(ui.Button, { onClick: onRemove, children: "Remove block" })] }));
}
