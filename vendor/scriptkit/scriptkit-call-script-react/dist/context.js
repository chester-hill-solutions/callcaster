import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const defaultComponents = {
    Button: ({ type = "button", onClick, disabled, children }) => (_jsx("button", { type: type, onClick: onClick, disabled: disabled, children: children })),
    Field: ({ label, children }) => (_jsxs("label", { style: { display: "grid", gap: "0.25rem" }, children: [_jsx("span", { children: label }), children] })),
    Textarea: ({ value, onChange, placeholder, readOnly, rows = 3 }) => (_jsx("textarea", { value: value, placeholder: placeholder, readOnly: readOnly, rows: rows, onChange: (event) => onChange(event.target.value) })),
    Input: ({ value, onChange, placeholder, readOnly }) => (_jsx("input", { value: value, placeholder: placeholder, readOnly: readOnly, onChange: (event) => onChange(event.target.value) })),
    Select: ({ value, onChange, options, readOnly }) => (_jsx("select", { value: value, disabled: readOnly, onChange: (event) => onChange(event.target.value), children: options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })),
};
const CallScriptUiContext = createContext(defaultComponents);
export function ScriptKitCallScriptUiProvider({ components, children, }) {
    const merged = { ...defaultComponents, ...components };
    return _jsx(CallScriptUiContext.Provider, { value: merged, children: children });
}
export function useCallScriptUi() {
    return useContext(CallScriptUiContext);
}
