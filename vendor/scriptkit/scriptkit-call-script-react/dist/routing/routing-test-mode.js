import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { createCallScriptService, } from "@chester-hill-solutions/scriptkit-call-script-core";
import { useCallScriptUi } from "../context.js";
const scripts = createCallScriptService();
export function RoutingTestMode({ document }) {
    const ui = useCallScriptUi();
    const [answers, setAnswers] = useState([]);
    const routing = useMemo(() => scripts.evaluateRouting(document, answers), [document, answers]);
    return (_jsxs("div", { className: "call-script-root", children: [_jsx("p", { className: "call-script-muted", children: "Routing test \u2014 simulate answers" }), Object.values(document.blocks).map((block) => {
                if (block.type === "instruction") {
                    return null;
                }
                const value = answers.find((a) => a.blockId === block.id)?.value ?? "";
                return (_jsx(ui.Field, { label: `${block.type}: ${block.id}`, children: _jsx(ui.Input, { value: value, onChange: (next) => {
                            setAnswers((prev) => [
                                ...prev.filter((a) => a.blockId !== block.id),
                                { blockId: block.id, value: next },
                            ]);
                        } }) }, block.id));
            }), _jsx(RoutingFlowPreview, { routing: routing })] }));
}
export function RoutingFlowPreview({ routing }) {
    return (_jsx("pre", { className: "call-script-muted", style: { whiteSpace: "pre-wrap" }, children: JSON.stringify(routing, null, 2) }));
}
