import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallScriptUi } from "../context.js";
import { useScriptEditorState } from "../hooks/use-script-editor-state.js";
export function ScriptEditor({ document, onChange, palette = "callcaster", readOnly = false, mediaNames = [], }) {
    const ui = useCallScriptUi();
    const editor = useScriptEditorState({
        initialDocument: document,
        palette,
        onChange,
    });
    return (_jsxs("div", { className: "call-script-root call-script-editor", children: [_jsxs("aside", { className: "call-script-pages", children: [_jsx("p", { className: "call-script-muted", children: "Pages" }), Object.values(editor.document.pages).map((page) => (_jsx(ui.Button, { onClick: () => editor.setActivePageId(page.id), disabled: readOnly && page.id !== editor.activePageId, children: page.title }, page.id)))] }), _jsxs("section", { children: [_jsx("div", { style: {
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            marginBottom: "1rem",
                        }, children: editor.blockTypes.map((type) => (_jsxs(ui.Button, { onClick: () => editor.addBlock(type), disabled: readOnly, children: ["Add ", type] }, type))) }), editor.activePage?.blockIds.map((blockId) => {
                        const block = editor.document.blocks[blockId];
                        if (!block) {
                            return null;
                        }
                        const active = editor.activeBlockId === blockId;
                        return (_jsx("div", { className: `call-script-block${active ? " call-script-block--active" : ""}`, onClick: () => editor.setActiveBlockId(blockId), children: _jsx(BlockEditor, { block: block, readOnly: readOnly, mediaNames: mediaNames, onChange: (patch) => editor.updateBlock(blockId, patch), onRemove: () => editor.removeBlock(blockId) }) }, blockId));
                    })] }), !editor.validation.ok && (_jsx("div", { className: "call-script-muted", role: "alert", children: editor.validation.errors.join("; ") }))] }));
}
function BlockEditor({ block, readOnly, mediaNames, onChange, onRemove, }) {
    const ui = useCallScriptUi();
    const prompt = "prompt" in block ? (block.prompt ?? "") : "";
    const body = block.type === "instruction" ? block.body : "";
    const options = "options" in block && block.options ? block.options : [];
    const isIvrBlock = block.callcasterType === "recorded" ||
        block.callcasterType === "synthetic" ||
        block.callcasterType === "say" ||
        block.speechType !== undefined;
    return (_jsxs("div", { style: { display: "grid", gap: "0.5rem" }, children: [_jsx("strong", { children: block.type }), block.title !== undefined && (_jsx(ui.Field, { label: "Title", children: _jsx(ui.Input, { value: block.title, readOnly: readOnly, onChange: (value) => onChange({ title: value }) }) })), block.type === "instruction" && (_jsx(ui.Field, { label: "Body", children: _jsx(ui.Textarea, { value: body, readOnly: readOnly, onChange: (value) => onChange({
                        body: value,
                        content: value,
                    }) }) })), block.type !== "instruction" && "prompt" in block && (_jsx(ui.Field, { label: "Prompt", children: _jsx(ui.Textarea, { value: prompt, readOnly: readOnly, onChange: (value) => onChange({
                        prompt: value,
                        content: value,
                    }) }) })), isIvrBlock && (_jsxs(_Fragment, { children: [_jsx(ui.Field, { label: "IVR block type", children: _jsx(ui.Select, { value: block.callcasterType ?? "say", readOnly: readOnly, options: [
                                { value: "recorded", label: "Recorded audio" },
                                { value: "synthetic", label: "Synthetic speech" },
                                { value: "say", label: "Say" },
                            ], onChange: (value) => onChange({ callcasterType: value }) }) }), block.speechType !== undefined && (_jsx(ui.Field, { label: "Speech type", children: _jsx(ui.Select, { value: block.speechType, readOnly: readOnly, options: [
                                { value: "recorded", label: "Recorded audio" },
                                { value: "synthetic", label: "Synthetic speech" },
                            ], onChange: (value) => onChange({ speechType: value }) }) })), _jsx(ui.Field, { label: block.callcasterType === "recorded" ? "Audio file" : "Speech text", children: block.callcasterType === "recorded" && mediaNames.length > 0 ? (_jsx(ui.Select, { value: block.audioFile ?? "", readOnly: readOnly, options: mediaNames.map((name) => ({
                                value: name,
                                label: name,
                            })), onChange: (value) => onChange({ audioFile: value }) })) : (_jsx(ui.Textarea, { value: block.audioFile ?? "", readOnly: readOnly, onChange: (value) => onChange({ audioFile: value }) })) })] })), options.length > 0 ||
                block.type === "choice" ||
                block.type === "select" ||
                block.type === "radio" ||
                block.type === "checkbox" ? (_jsx(ui.Field, { label: "Options (comma-separated value:label)", children: _jsx(ui.Textarea, { value: options.map((o) => `${o.value}:${o.label}`).join("\n"), readOnly: readOnly, onChange: (raw) => {
                        onChange({
                            options: mergeEditedOptions(raw, options),
                        });
                    } }) })) : null, options.map((option, index) => (_jsx(ui.Field, { label: `Next target for ${option.label}`, children: _jsx(ui.Input, { value: option.next ?? "", placeholder: "Page/block ID or hangup", readOnly: readOnly, onChange: (next) => onChange({
                        options: options.map((candidate, candidateIndex) => candidateIndex === index
                            ? { ...candidate, next: next || undefined }
                            : candidate),
                    }) }) }, `${option.value}-${index}`))), !readOnly && _jsx(ui.Button, { onClick: onRemove, children: "Remove block" })] }));
}
export function mergeEditedOptions(raw, existingOptions) {
    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
        const separatorIndex = line.indexOf(":");
        const value = separatorIndex === -1
            ? line.trim()
            : line.slice(0, separatorIndex).trim();
        const label = separatorIndex === -1
            ? value
            : line.slice(separatorIndex + 1).trim() || value;
        const existing = existingOptions.find((option) => option.value === value) ??
            existingOptions[index];
        return {
            ...existing,
            value,
            label,
            ...(existing?.content !== undefined ? { content: label } : {}),
        };
    });
}
