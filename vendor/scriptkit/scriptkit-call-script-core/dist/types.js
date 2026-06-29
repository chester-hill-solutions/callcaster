import { z } from "zod";
export const scriptPaletteSchema = z.enum(["callcaster", "canvass"]);
export const routingRuleSchema = z.object({
    answerValue: z.string(),
    targetPageId: z.string().optional(),
    targetBlockId: z.string().optional(),
});
const baseBlockFields = {
    id: z.string().min(1),
    label: z.string().optional(),
    prompt: z.string().optional(),
    required: z.boolean().optional(),
    routingRules: z.array(routingRuleSchema).optional(),
};
export const instructionBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("instruction"),
    body: z.string().default(""),
});
export const yesNoBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("yes_no"),
    prompt: z.string().default(""),
});
export const choiceBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("choice"),
    prompt: z.string().default(""),
    options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});
export const textBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("text"),
    prompt: z.string().default(""),
    placeholder: z.string().optional(),
});
export const supportBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("support"),
    prompt: z.string().default(""),
});
export const textareaBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("textarea"),
    prompt: z.string().default(""),
});
export const selectBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("select"),
    prompt: z.string().default(""),
    options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});
export const radioBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("radio"),
    prompt: z.string().default(""),
    options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});
export const checkboxBlockSchema = z.object({
    ...baseBlockFields,
    type: z.literal("checkbox"),
    prompt: z.string().default(""),
    options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});
export const scriptBlockSchema = z.discriminatedUnion("type", [
    instructionBlockSchema,
    yesNoBlockSchema,
    choiceBlockSchema,
    textBlockSchema,
    supportBlockSchema,
    textareaBlockSchema,
    selectBlockSchema,
    radioBlockSchema,
    checkboxBlockSchema,
]);
export const scriptPageSchema = z.object({
    id: z.string().min(1),
    title: z.string().default("Page"),
    blockIds: z.array(z.string()).default([]),
});
export const scriptDocumentSchema = z.object({
    version: z.literal(1),
    startPageId: z.string().min(1),
    pages: z.record(z.string(), scriptPageSchema),
    blocks: z.record(z.string(), scriptBlockSchema),
});
export const callcasterFlowSchema = z.object({
    pages: z.record(z.string(), z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        blocks: z.array(z.string()).optional(),
    })),
    blocks: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export const quickCanvassBlockSchema = z.object({
    id: z.string(),
    type: z.enum(["instruction", "yes_no", "choice", "text", "support"]),
    prompt: z.string().optional(),
    body: z.string().optional(),
    options: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
});
export const CANVASS_BLOCK_TYPES = [
    "instruction",
    "yes_no",
    "choice",
    "text",
    "support",
];
export const CALLCASTER_BLOCK_TYPES = [
    "instruction",
    "textarea",
    "select",
    "radio",
    "checkbox",
];
