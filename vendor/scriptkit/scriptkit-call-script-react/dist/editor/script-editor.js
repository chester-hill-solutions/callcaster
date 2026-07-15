import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallScriptUi } from "../context.js";
import { useScriptEditorState, } from "../hooks/use-script-editor-state.js";
/** Stands in for "no routing target"; see routingOptions below. */
const NO_ROUTING_TARGET = "__none__";
/**
 * Reference editor for the headless state in `useScriptEditorState`.
 *
 * Deliberately plain: it injects its controls via `useCallScriptUi` so a host
 * app can supply its own design system. Hosts wanting a first-class builder
 * should consume the hook directly rather than restyle this.
 */
export function ScriptEditor({ document, onChange, palette = "callcaster", readOnly = false, mediaNames = [], }) {
    const ui = useCallScriptUi();
    const editor = useScriptEditorState({
        initialDocument: document,
        palette,
        onChange,
    });
    return (_jsxs("div", { className: "call-script-root call-script-editor", children: [_jsxs("aside", { className: "call-script-pages", children: [_jsx("p", { className: "call-script-muted", children: "Pages" }), editor.orderedPages.map((page, index) => (_jsxs("div", { className: "call-script-page-row", children: [_jsxs(ui.Button, { onClick: () => editor.setActivePageId(page.id), disabled: readOnly && page.id !== editor.activePageId, children: [page.title, page.id === editor.document.startPageId ? " (start)" : ""] }), !readOnly && (_jsxs(_Fragment, { children: [_jsx(ui.Button, { onClick: () => editor.movePage(page.id, index - 1), children: "Move up" }), _jsx(ui.Button, { onClick: () => editor.movePage(page.id, index + 1), children: "Move down" }), _jsx(ui.Button, { onClick: () => editor.setStartPage(page.id), children: "Set as start" }), _jsx(ui.Button, { onClick: () => editor.removePage(page.id), children: "Remove page" })] }))] }, page.id))), !readOnly && _jsx(ui.Button, { onClick: () => editor.addPage(), children: "Add page" })] }), _jsxs("section", { children: [_jsxs("div", { style: {
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            marginBottom: "1rem",
                        }, children: [editor.activePage && !readOnly && (_jsx(ui.Field, { label: "Page title", children: _jsx(ui.Input, { value: editor.activePage.title, onChange: (value) => editor.renamePage(editor.activePageId, value) }) })), editor.blockTypes.map((type) => (_jsxs(ui.Button, { onClick: () => editor.addBlock(type), disabled: readOnly, children: ["Add ", type] }, type)))] }), editor.activePage?.blockIds.map((blockId, index) => {
                        const block = editor.document.blocks[blockId];
                        if (!block) {
                            return null;
                        }
                        const active = editor.activeBlockId === blockId;
                        return (_jsx("div", { className: `call-script-block${active ? " call-script-block--active" : ""}`, onClick: () => editor.setActiveBlockId(blockId), children: _jsx(BlockEditor, { block: block, readOnly: readOnly, mediaNames: mediaNames, routingTargets: editor.routingTargets, onChange: (patch) => editor.updateBlock(blockId, patch), onRemove: () => editor.removeBlock(blockId), onDuplicate: () => editor.duplicateBlock(blockId), onMoveUp: () => editor.moveBlock(blockId, index - 1), onMoveDown: () => editor.moveBlock(blockId, index + 1), onOptionAdd: () => editor.addOption(blockId), onOptionChange: (optionId, patch) => editor.updateOption(blockId, optionId, patch), onOptionRemove: (optionId) => editor.removeOption(blockId, optionId) }) }, blockId));
                    })] }), !editor.validation.ok && (_jsx("div", { className: "call-script-muted", role: "alert", children: editor.validation.errors.join("; ") }))] }));
}
function BlockEditor({ block, readOnly, mediaNames, routingTargets, onChange, onRemove, onDuplicate, onMoveUp, onMoveDown, onOptionAdd, onOptionChange, onOptionRemove, }) {
    const ui = useCallScriptUi();
    const prompt = "prompt" in block ? (block.prompt ?? "") : "";
    const body = block.type === "instruction" ? block.body : "";
    const options = "options" in block && block.options ? block.options : [];
    const isIvrBlock = block.callcasterType === "recorded" ||
        block.callcasterType === "synthetic" ||
        block.callcasterType === "say" ||
        block.speechType !== undefined;
    const takesOptions = block.type === "choice" ||
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
            label: target.kind === "block"
                ? `${target.pageTitle} — ${target.label}`
                : target.label,
        })),
    ];
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
                            })), onChange: (value) => onChange({ audioFile: value }) })) : (_jsx(ui.Textarea, { value: block.audioFile ?? "", readOnly: readOnly, onChange: (value) => onChange({ audioFile: value }) })) })] })), takesOptions && (_jsxs(_Fragment, { children: [options.map((option, index) => (
                    // Keyed by the option's stable id, not its index or value, so a row
                    // isn't remounted (losing focus) while its value is being typed.
                    _jsxs("div", { style: { display: "grid", gap: "0.25rem" }, children: [_jsx(ui.Field, { label: "Option value", children: _jsx(ui.Input, { value: option.value, readOnly: readOnly, onChange: (value) => onOptionChange(option.id ?? "", { value }) }) }), _jsx(ui.Field, { label: "Option label", children: _jsx(ui.Input, { value: option.label, readOnly: readOnly, onChange: (label) => onOptionChange(option.id ?? "", { label, content: label }) }) }), _jsx(ui.Field, { label: "Next target", children: _jsx(ui.Select
                                // `||`, not `??`: legacy wire data stores "no target" as an
                                // empty string, which would otherwise select nothing at all.
                                , { 
                                    // `||`, not `??`: legacy wire data stores "no target" as an
                                    // empty string, which would otherwise select nothing at all.
                                    value: option.next || NO_ROUTING_TARGET, readOnly: readOnly, options: routingOptions, onChange: (next) => onOptionChange(option.id ?? "", {
                                        next: next === NO_ROUTING_TARGET ? undefined : next,
                                    }) }) }), !readOnly && (_jsx(ui.Button, { onClick: () => onOptionRemove(option.id ?? ""), children: "Remove option" }))] }, option.id ?? index))), !readOnly && _jsx(ui.Button, { onClick: onOptionAdd, children: "Add option" })] })), !readOnly && (_jsxs("div", { style: { display: "flex", gap: "0.5rem", flexWrap: "wrap" }, children: [_jsx(ui.Button, { onClick: onMoveUp, children: "Move up" }), _jsx(ui.Button, { onClick: onMoveDown, children: "Move down" }), _jsx(ui.Button, { onClick: onDuplicate, children: "Duplicate block" }), _jsx(ui.Button, { onClick: onRemove, children: "Remove block" })] }))] }));
}
