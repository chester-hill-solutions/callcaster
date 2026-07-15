import { type ScriptBlock, type ScriptDocument, type ScriptOption, type ScriptPalette } from "@chester-hill-solutions/scriptkit-call-script-core";
export type UseScriptEditorStateOptions = {
    initialDocument: ScriptDocument;
    palette?: ScriptPalette;
    onChange?: (doc: ScriptDocument) => void;
};
/** A place an option's `next` can point. */
export type RoutingTarget = {
    kind: "page";
    id: string;
    label: string;
} | {
    kind: "block";
    id: string;
    label: string;
    pageTitle: string;
} | {
    kind: "special";
    id: "hangup";
    label: string;
};
export declare function useScriptEditorState(options: UseScriptEditorStateOptions): {
    document: {
        version: 1;
        startPageId: string;
        pageOrder: string[];
        pages: Record<string, {
            id: string;
            title: string;
            blockIds: string[];
            wireExtras?: Record<string, unknown> | undefined;
        }>;
        blocks: Record<string, {
            type: "instruction";
            body: string;
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            prompt?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "yes_no";
            prompt: string;
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "choice";
            prompt: string;
            options: {
                value: string;
                label: string;
                next?: string | undefined;
                content?: string | undefined;
                id?: string | undefined;
                wireExtras?: Record<string, unknown> | undefined;
            }[];
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "text";
            prompt: string;
            id: string;
            placeholder?: string | undefined;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "support";
            prompt: string;
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "textarea";
            prompt: string;
            id: string;
            options?: {
                value: string;
                label: string;
                next?: string | undefined;
                content?: string | undefined;
                id?: string | undefined;
                wireExtras?: Record<string, unknown> | undefined;
            }[] | undefined;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "select";
            prompt: string;
            options: {
                value: string;
                label: string;
                next?: string | undefined;
                content?: string | undefined;
                id?: string | undefined;
                wireExtras?: Record<string, unknown> | undefined;
            }[];
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "radio";
            prompt: string;
            options: {
                value: string;
                label: string;
                next?: string | undefined;
                content?: string | undefined;
                id?: string | undefined;
                wireExtras?: Record<string, unknown> | undefined;
            }[];
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        } | {
            type: "checkbox";
            prompt: string;
            options: {
                value: string;
                label: string;
                next?: string | undefined;
                content?: string | undefined;
                id?: string | undefined;
                wireExtras?: Record<string, unknown> | undefined;
            }[];
            id: string;
            label?: string | undefined;
            title?: string | undefined;
            content?: string | undefined;
            required?: boolean | undefined;
            routingRules?: {
                answerValue: string;
                targetPageId?: string | undefined;
                targetBlockId?: string | undefined;
            }[] | undefined;
            audioFile?: string | undefined;
            callcasterType?: string | undefined;
            speechType?: string | undefined;
            wireExtras?: Record<string, unknown> | undefined;
        }>;
    };
    activePageId: string;
    activePage: {
        id: string;
        title: string;
        blockIds: string[];
        wireExtras?: Record<string, unknown> | undefined;
    } | undefined;
    activeBlockId: string | null;
    blockTypes: readonly ["instruction", "yes_no", "choice", "text", "support"] | readonly ["instruction", "textarea", "select", "radio", "checkbox"];
    orderedPages: {
        id: string;
        title: string;
        blockIds: string[];
        wireExtras?: Record<string, unknown> | undefined;
    }[];
    pageOrder: string[];
    routingTargets: RoutingTarget[];
    incomingRefs: (targetId: string) => string[];
    setActivePageId: import("react").Dispatch<import("react").SetStateAction<string>>;
    setActiveBlockId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    addPage: (title?: string) => string;
    renamePage: (pageId: string, title: string) => void;
    removePage: (pageId: string) => void;
    movePage: (pageId: string, toIndex: number) => void;
    setStartPage: (pageId: string) => void;
    addBlock: (type: ScriptBlock["type"], atIndex?: number) => string;
    updateBlock: (blockId: string, patch: Partial<ScriptBlock>) => void;
    removeBlock: (blockId: string) => void;
    duplicateBlock: (blockId: string) => string;
    moveBlock: (blockId: string, toIndex: number) => void;
    moveBlockToPage: (blockId: string, toPageId: string, toIndex?: number) => void;
    changeBlockType: (blockId: string, type: ScriptBlock["type"]) => void;
    addOption: (blockId: string) => string;
    updateOption: (blockId: string, optionId: string, patch: Partial<ScriptOption>) => void;
    removeOption: (blockId: string, optionId: string) => void;
    moveOption: (blockId: string, optionId: string, toIndex: number) => void;
    validation: import("@chester-hill-solutions/scriptkit-call-script-core").ValidateDocumentResult;
    setDocument: (next: ScriptDocument) => void;
};
/** Best human-readable name for a block, never its generated id. */
export declare function blockLabel(block: ScriptBlock): string;
