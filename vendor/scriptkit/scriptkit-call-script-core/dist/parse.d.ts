import { type ParseDocumentOptions, type ScriptDocument, type ScriptPalette, type ValidateDocumentResult } from "./types.js";
export declare function parseDocument(input: unknown, options?: ParseDocumentOptions): ScriptDocument;
export declare function validateDocument(doc: unknown): ValidateDocumentResult;
export declare function createEmptyDocument(options?: {
    palette?: ScriptPalette;
    title?: string;
}): ScriptDocument;
export declare function parseQuickCanvassBlocks(input: unknown): {
    id: string;
    type: "instruction" | "yes_no" | "choice" | "text" | "support";
    prompt?: string | undefined;
    body?: string | undefined;
    options?: {
        value: string;
        label: string;
    }[] | undefined;
    placeholder?: string | undefined;
    required?: boolean | undefined;
}[];
