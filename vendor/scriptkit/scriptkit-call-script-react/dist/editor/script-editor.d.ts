import type { ScriptDocument, ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
export type ScriptEditorProps = {
    document: ScriptDocument;
    onChange: (doc: ScriptDocument) => void;
    palette?: ScriptPalette;
    readOnly?: boolean;
};
export declare function ScriptEditor({ document, onChange, palette, readOnly }: ScriptEditorProps): import("react").JSX.Element;
