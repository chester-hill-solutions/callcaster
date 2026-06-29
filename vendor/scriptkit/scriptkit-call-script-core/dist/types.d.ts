import { z } from "zod";
export declare const scriptPaletteSchema: z.ZodEnum<{
    callcaster: "callcaster";
    canvass: "canvass";
}>;
export type ScriptPalette = z.infer<typeof scriptPaletteSchema>;
export declare const routingRuleSchema: z.ZodObject<{
    answerValue: z.ZodString;
    targetPageId: z.ZodOptional<z.ZodString>;
    targetBlockId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export declare const instructionBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"instruction">;
    body: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const yesNoBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"yes_no">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const choiceBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"choice">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const textBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"text">;
    prompt: z.ZodDefault<z.ZodString>;
    placeholder: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const supportBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"support">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const textareaBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"textarea">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const selectBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"select">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const radioBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"radio">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const checkboxBlockSchema: z.ZodObject<{
    type: z.ZodLiteral<"checkbox">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const scriptBlockSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"instruction">;
    body: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"yes_no">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"choice">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"text">;
    prompt: z.ZodDefault<z.ZodString>;
    placeholder: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"support">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"textarea">;
    prompt: z.ZodDefault<z.ZodString>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"select">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"radio">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"checkbox">;
    prompt: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    id: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
        answerValue: z.ZodString;
        targetPageId: z.ZodOptional<z.ZodString>;
        targetBlockId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>], "type">;
export type ScriptBlock = z.infer<typeof scriptBlockSchema>;
export declare const scriptPageSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodDefault<z.ZodString>;
    blockIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ScriptPage = z.infer<typeof scriptPageSchema>;
export declare const scriptDocumentSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    startPageId: z.ZodString;
    pages: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        title: z.ZodDefault<z.ZodString>;
        blockIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    blocks: z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"instruction">;
        body: z.ZodDefault<z.ZodString>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"yes_no">;
        prompt: z.ZodDefault<z.ZodString>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"choice">;
        prompt: z.ZodDefault<z.ZodString>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"text">;
        prompt: z.ZodDefault<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"support">;
        prompt: z.ZodDefault<z.ZodString>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"textarea">;
        prompt: z.ZodDefault<z.ZodString>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"select">;
        prompt: z.ZodDefault<z.ZodString>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"radio">;
        prompt: z.ZodDefault<z.ZodString>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"checkbox">;
        prompt: z.ZodDefault<z.ZodString>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>>;
        id: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        routingRules: z.ZodOptional<z.ZodArray<z.ZodObject<{
            answerValue: z.ZodString;
            targetPageId: z.ZodOptional<z.ZodString>;
            targetBlockId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strip>;
export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;
export declare const callcasterFlowSchema: z.ZodObject<{
    pages: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        blocks: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    blocks: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type CallcasterFlow = z.infer<typeof callcasterFlowSchema>;
export declare const quickCanvassBlockSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        instruction: "instruction";
        yes_no: "yes_no";
        choice: "choice";
        text: "text";
        support: "support";
    }>;
    prompt: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    placeholder: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type QuickCanvassBlock = z.infer<typeof quickCanvassBlockSchema>;
export declare const CANVASS_BLOCK_TYPES: readonly ["instruction", "yes_no", "choice", "text", "support"];
export declare const CALLCASTER_BLOCK_TYPES: readonly ["instruction", "textarea", "select", "radio", "checkbox"];
export type ParseMode = "strict" | "permissive";
export type ParseDocumentOptions = {
    mode?: ParseMode;
};
export type ValidateDocumentResult = {
    ok: true;
    document: ScriptDocument;
} | {
    ok: false;
    errors: string[];
};
export type RoutingAnswer = {
    blockId: string;
    value: string;
};
export type RoutingResult = {
    nextPageId: string | null;
    nextBlockId: string | null;
    complete: boolean;
};
export type MergeTagContext = Record<string, string | number | boolean | null | undefined>;
export type CreateEmptyDocumentOptions = {
    palette?: ScriptPalette;
    title?: string;
};
export type CallScriptServiceConfig = {
    defaultPalette?: ScriptPalette;
};
export type CallScriptService = {
    parseDocument: (input: unknown, options?: ParseDocumentOptions) => ScriptDocument;
    validateDocument: (doc: unknown) => ValidateDocumentResult;
    migrateFromCallcasterFlow: (flow: unknown) => ScriptDocument;
    serializeToCallcasterFlow: (doc: ScriptDocument) => CallcasterFlow;
    migrateFromQuickCanvassBlocks: (blocks: unknown) => ScriptDocument;
    serializeToQuickCanvassBlocks: (doc: ScriptDocument) => QuickCanvassBlock[];
    evaluateRouting: (doc: ScriptDocument, answers: RoutingAnswer[], startPageId?: string) => RoutingResult;
    applyMergeTags: (text: string, context: MergeTagContext) => string;
    createEmptyDocument: (options?: CreateEmptyDocumentOptions) => ScriptDocument;
};
