import { type ComponentType, type ReactNode } from "react";
export type CallScriptUiComponents = {
    Button: ComponentType<{
        type?: "button" | "submit";
        onClick?: () => void;
        disabled?: boolean;
        children: ReactNode;
    }>;
    Field: ComponentType<{
        label: string;
        children: ReactNode;
    }>;
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
        options: Array<{
            value: string;
            label: string;
        }>;
        readOnly?: boolean;
    }>;
};
export type ScriptKitCallScriptUiProviderProps = {
    components?: Partial<CallScriptUiComponents>;
    children: ReactNode;
};
export declare function ScriptKitCallScriptUiProvider({ components, children, }: ScriptKitCallScriptUiProviderProps): import("react").JSX.Element;
export declare function useCallScriptUi(): CallScriptUiComponents;
