import { type ScriptBlock, type ScriptDocument, type ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
export type UseScriptEditorStateOptions = {
    initialDocument: ScriptDocument;
    palette?: ScriptPalette;
    onChange?: (doc: ScriptDocument) => void;
};
export declare function useScriptEditorState(options: UseScriptEditorStateOptions): {
    document: {
        version: 1;
        startPageId: string;
        pages: Record<string, {
            id: string;
            title: string;
            blockIds: string[];
        }>;
        blocks: Record<string, {
            type: "instruction";
            body: string;
            id: string;
            label?: string | undefined;
            prompt?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "yes_no";
            prompt: string;
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "choice";
            prompt: string;
            options: {
                value: string;
                label: string;
            }[];
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "text";
            prompt: string;
            id: string;
            placeholder?: string | undefined;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "support";
            prompt: string;
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "textarea";
            prompt: string;
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "select";
            prompt: string;
            options: {
                value: string;
                label: string;
            }[];
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "radio";
            prompt: string;
            options: {
                value: string;
                label: string;
            }[];
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        } | {
            type: "checkbox";
            prompt: string;
            options: {
                value: string;
                label: string;
            }[];
            id: string;
            label?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
        }>;
    };
    activePageId: string;
    activePage: {
        id: string;
        title: string;
        blockIds: string[];
    } | undefined;
    activeBlockId: string | null;
    blockTypes: readonly ["instruction", "yes_no", "choice", "text", "support"] | readonly ["instruction", "textarea", "select", "radio", "checkbox"];
    setActivePageId: import("react").Dispatch<import("react").SetStateAction<string>>;
    setActiveBlockId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    addBlock: (type: ScriptBlock["type"]) => void;
    updateBlock: (blockId: string, patch: Partial<ScriptBlock>) => void;
    removeBlock: (blockId: string) => void;
    validation: import("@chester-hill-solutions/scriptkit-call-script-core").ValidateDocumentResult;
    setDocument: (next: ScriptDocument) => void;
};
