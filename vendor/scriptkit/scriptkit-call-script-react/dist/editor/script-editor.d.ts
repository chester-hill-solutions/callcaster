import type { ScriptDocument, ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
export type ScriptEditorProps = {
    document: ScriptDocument;
    onChange: (doc: ScriptDocument) => void;
    palette?: ScriptPalette;
    readOnly?: boolean;
    mediaNames?: string[];
};
/**
 * Reference editor for the headless state in `useScriptEditorState`.
 *
 * Deliberately plain: it injects its controls via `useCallScriptUi` so a host
 * app can supply its own design system. Hosts wanting a first-class builder
 * should consume the hook directly rather than restyle this.
 */
export declare function ScriptEditor({ document, onChange, palette, readOnly, mediaNames, }: ScriptEditorProps): import("react").JSX.Element;
