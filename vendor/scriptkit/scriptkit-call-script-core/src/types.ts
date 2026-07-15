import { z } from "zod";

export const scriptPaletteSchema = z.enum(["callcaster", "canvass"]);
export type ScriptPalette = z.infer<typeof scriptPaletteSchema>;

export const routingRuleSchema = z.object({
  answerValue: z.string(),
  targetPageId: z.string().optional(),
  targetBlockId: z.string().optional(),
});

export type RoutingRule = z.infer<typeof routingRuleSchema>;

const baseBlockFields = {
  id: z.string().min(1),
  label: z.string().optional(),
  /** Original Callcaster block title, retained independently from prompt text. */
  title: z.string().optional(),
  /** Original Callcaster wire content, retained through editor round-trips. */
  content: z.string().optional(),
  prompt: z.string().optional(),
  required: z.boolean().optional(),
  routingRules: z.array(routingRuleSchema).optional(),
  /** Recorded-audio reference carried through from/to the Callcaster wire format. */
  audioFile: z.string().optional(),
  /** Original Callcaster wire type (including recorded/synthetic/say). */
  callcasterType: z.string().optional(),
  /** Callcaster IVR playback mode, when supplied separately from type. */
  speechType: z.string().optional(),
};

/**
 * Option shape shared by choice/select/radio/checkbox blocks. `value`/`label`
 * are the canonical internal representation; `next` and `content` are
 * carried through losslessly from the Callcaster wire format (which keys
 * options by `{ content, next }` rather than `{ value, label }`) so a
 * migrate -> serialize round-trip doesn't drop routing or original text.
 */
const scriptOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  next: z.string().optional(),
  content: z.string().optional(),
});

export type ScriptOption = z.infer<typeof scriptOptionSchema>;

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
  options: z.array(scriptOptionSchema).default([]),
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
  options: z.array(scriptOptionSchema).optional(),
});

export const selectBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal("select"),
  prompt: z.string().default(""),
  options: z.array(scriptOptionSchema).default([]),
});

export const radioBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal("radio"),
  prompt: z.string().default(""),
  options: z.array(scriptOptionSchema).default([]),
});

export const checkboxBlockSchema = z.object({
  ...baseBlockFields,
  type: z.literal("checkbox"),
  prompt: z.string().default(""),
  options: z.array(scriptOptionSchema).default([]),
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

export type ScriptBlock = z.infer<typeof scriptBlockSchema>;

export const scriptPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().default("Page"),
  blockIds: z.array(z.string()).default([]),
});

export type ScriptPage = z.infer<typeof scriptPageSchema>;

export const scriptDocumentSchema = z.object({
  version: z.literal(1),
  startPageId: z.string().min(1),
  pages: z.record(z.string(), scriptPageSchema),
  blocks: z.record(z.string(), scriptBlockSchema),
});

export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;

export const callcasterFlowSchema = z.object({
  pages: z.record(
    z.string(),
    z.object({
      id: z.string().optional(),
      title: z.string().optional(),
      blocks: z.array(z.string()).optional(),
    }),
  ),
  blocks: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export type CallcasterFlow = z.infer<typeof callcasterFlowSchema>;

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

export type QuickCanvassBlock = z.infer<typeof quickCanvassBlockSchema>;

export const CANVASS_BLOCK_TYPES = [
  "instruction",
  "yes_no",
  "choice",
  "text",
  "support",
] as const;

export const CALLCASTER_BLOCK_TYPES = [
  "instruction",
  "textarea",
  "select",
  "radio",
  "checkbox",
] as const;

export type ParseMode = "strict" | "permissive";

export type ParseDocumentOptions = {
  mode?: ParseMode;
};

export type ValidateDocumentResult =
  | { ok: true; document: ScriptDocument }
  | { ok: false; errors: string[] };

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
  evaluateRouting: (
    doc: ScriptDocument,
    answers: RoutingAnswer[],
    startPageId?: string,
  ) => RoutingResult;
  applyMergeTags: (text: string, context: MergeTagContext) => string;
  createEmptyDocument: (options?: CreateEmptyDocumentOptions) => ScriptDocument;
};
