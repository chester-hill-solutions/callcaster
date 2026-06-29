import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export type CallScriptUiComponents = {
  Button: ComponentType<{ type?: "button" | "submit"; onClick?: () => void; disabled?: boolean; children: ReactNode }>;
  Field: ComponentType<{ label: string; children: ReactNode }>;
  Textarea: ComponentType<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    rows?: number;
  }>;
  Input: ComponentType<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
  }>;
  Select: ComponentType<{
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    readOnly?: boolean;
  }>;
};

const defaultComponents: CallScriptUiComponents = {
  Button: ({ type = "button", onClick, disabled, children }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Field: ({ label, children }) => (
    <label style={{ display: "grid", gap: "0.25rem" }}>
      <span>{label}</span>
      {children}
    </label>
  ),
  Textarea: ({ value, onChange, placeholder, readOnly, rows = 3 }) => (
    <textarea
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  Input: ({ value, onChange, placeholder, readOnly }) => (
    <input
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  Select: ({ value, onChange, options, readOnly }) => (
    <select value={value} disabled={readOnly} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
};

const CallScriptUiContext = createContext<CallScriptUiComponents>(defaultComponents);

export type ScriptKitCallScriptUiProviderProps = {
  components?: Partial<CallScriptUiComponents>;
  children: ReactNode;
};

export function ScriptKitCallScriptUiProvider({
  components,
  children,
}: ScriptKitCallScriptUiProviderProps) {
  const merged = { ...defaultComponents, ...components };
  return <CallScriptUiContext.Provider value={merged}>{children}</CallScriptUiContext.Provider>;
}

export function useCallScriptUi(): CallScriptUiComponents {
  return useContext(CallScriptUiContext);
}
