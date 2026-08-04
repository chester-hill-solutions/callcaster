import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { createCallScriptService, } from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";
const scripts = createCallScriptService();
export function ScriptRunner({ document, mergeContext = {}, onComplete, readOnly = false, }) {
    const ui = useCallScriptUi();
    const [answers, setAnswers] = useState([]);
    const routing = useMemo(() => scripts.evaluateRouting(document, answers), [document, answers]);
    const currentBlockId = routing.nextBlockId;
    const currentBlock = currentBlockId ? document.blocks[currentBlockId] : null;
    const currentAnswer = answers.find((a) => a.blockId === currentBlockId)?.value ?? "";
    const setAnswer = (value) => {
        if (!currentBlockId) {
            return;
        }
        setAnswers((prev) => {
            const rest = prev.filter((a) => a.blockId !== currentBlockId);
            const next = [...rest, { blockId: currentBlockId, value }];
            const result = scripts.evaluateRouting(document, next);
            if (result.complete) {
                onComplete?.(next);
            }
            return next;
        });
    };
    if (routing.complete) {
        return (_jsx("div", { className: "call-script-root call-script-runner", children: _jsx("p", { children: "Script complete." }) }));
    }
    if (!currentBlock) {
        return (_jsx("div", { className: "call-script-root call-script-runner", children: _jsx("p", { className: "call-script-muted", children: "No block to display." }) }));
    }
    const prompt = "prompt" in currentBlock
        ? scripts.applyMergeTags(currentBlock.prompt ?? "", mergeContext)
        : "";
    const body = currentBlock.type === "instruction"
        ? scripts.applyMergeTags(currentBlock.body, mergeContext)
        : "";
    return (_jsxs("div", { className: "call-script-root call-script-runner", children: [body && _jsx("p", { children: body }), currentBlock.type === "instruction" && (_jsx(ui.Button, { onClick: () => setAnswer("__continue__"), disabled: readOnly, children: "Continue" })), currentBlock.type === "yes_no" && (_jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx(ui.Button, { onClick: () => setAnswer("yes"), disabled: readOnly, children: "Yes" }), _jsx(ui.Button, { onClick: () => setAnswer("no"), disabled: readOnly, children: "No" })] })), (currentBlock.type === "text" || currentBlock.type === "textarea") && (_jsx(ui.Field, { label: prompt || "Response", children: _jsx(ui.Textarea, { value: currentAnswer, readOnly: readOnly, onChange: setAnswer }) })), (currentBlock.type === "choice" ||
                currentBlock.type === "select" ||
                currentBlock.type === "radio") && (_jsx(ui.Field, { label: prompt || "Choose", children: _jsx(ui.Select, { value: currentAnswer, readOnly: readOnly, options: currentBlock.options ?? [], onChange: setAnswer }) })), currentBlock.type === "support" && (_jsx(ui.Field, { label: prompt || "Notes", children: _jsx(ui.Textarea, { value: currentAnswer, readOnly: readOnly, onChange: setAnswer }) }))] }));
}
