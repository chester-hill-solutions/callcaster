import type { ScriptDocument, ScriptOption, ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
export type ScriptEditorProps = {
    document: ScriptDocument;
    onChange: (doc: ScriptDocument) => void;
    palette?: ScriptPalette;
    readOnly?: boolean;
    mediaNames?: string[];
};
export declare function ScriptEditor({ document, onChange, palette, readOnly, mediaNames, }: ScriptEditorProps): import("react").JSX.Element;
export declare function mergeEditedOptions(raw: string, existingOptions: ScriptOption[]): ScriptOption[];
