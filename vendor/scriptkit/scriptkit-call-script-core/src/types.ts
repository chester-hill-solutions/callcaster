import { z } from "zod";

export const scriptPaletteSchema = z.enum(["callcaster", "canvass"]);
export type ScriptPalette = z.infer<typeof scriptPaletteSchema>;

export const routingRuleSchema = z.object({
  answerValue: z.string(),
  targetPageId: z.string().optional(),
  targetBlockId: z.string().optional(),
});

export type RoutingRule = z.infer<typeof routingRuleSchema>;

/**
 * Wire keys this package does not model, carried verbatim so a
 * migrate -> serialize round-trip cannot drop them.
 *
 * `steps` is live production jsonb consumed by renderers this package knows
 * nothing about. Callcaster's agent-facing `Result.tsx` keys rendering off
 * `option.Icon` and reads `block.text`; its IVR routes read `responseType`.
 * None of those are in the schema below, and reconstructing a block from only
 * the modelled fields silently deleted them on every save. Rather than model
 * every downstream consumer's private fields, preserve whatever we don't
 * understand.
 */
const wireExtrasSchema = z.record(z.string(), z.unknown()).optional();

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
  /** Unmodelled wire keys (e.g. `text`, `responseType`). See wireExtrasSchema. */
  wireExtras: wireExtrasSchema,
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
  /**
   * Stable editor identity. Generated on migrate and never serialized — the
   * wire format has no option id. It exists so an editor can address one
   * option while its `value` is being typed. Without it, identity has to be
   * re-derived from the text on every keystroke, which is what made the old
   * textarea-based option editor reassign `next` to the wrong option.
   */
  id: z.string().optional(),
  /** Unmodelled option keys (e.g. `Icon`). See wireExtrasSchema. */
  wireExtras: wireExtrasSchema,
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
  /**
   * Unmodelled page keys. Callcaster's IVR status route locates the voicemail
   * page by reading `speechType`/`say` off the page itself, so pages need the
   * same preservation treatment as blocks.
   */
  wireExtras: wireExtrasSchema,
});

export type ScriptPage = z.infer<typeof scriptPageSchema>;

export const scriptDocumentSchema = z.object({
  version: z.literal(1),
  startPageId: z.string().min(1),
  /**
   * Explicit page order. `pages` is a Record, so its order is only ever
   * insertion order — and `steps` is stored as Postgres `jsonb`, which
   * normalizes object keys (by length, then bytewise) and discards insertion
   * order entirely. Page order therefore cannot live in `pages` and must be
   * an array, which jsonb does preserve.
   */
  pageOrder: z.array(z.string()).default([]),
  pages: z.record(z.string(), scriptPageSchema),
  blocks: z.record(z.string(), scriptBlockSchema),
});

export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;

export const callcasterFlowSchema = z.object({
  /**
   * Which page the script starts on. Optional for backward compatibility:
   * scripts written before this key existed fall back to the first entry of
   * `pageOrder`. That fallback used to be `Object.keys(pages)[0]`, which under
   * jsonb meant "whichever page id sorts shortest" — effectively arbitrary.
   */
  startPageId: z.string().optional(),
  /** Explicit page order; see scriptDocumentSchema.pageOrder. */
  pageOrder: z.array(z.string()).optional(),
  pages: z.record(
    z.string(),
    z
      .object({
        id: z.string().optional(),
        title: z.string().optional(),
        blocks: z.array(z.string()).optional(),
      })
      // Pages carry unmodelled keys too (the IVR voicemail lookup reads
      // `speechType` and `say` off a page). Keep them.
      .passthrough(),
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

/**
 * Callcaster IVR playback modes.
 *
 * On the wire these occupy the same `type` field as the input types above,
 * so a block is either an input (radio/dropdown/...) or a playback step
 * (recorded/synthetic/say) — never both. Anything that rewrites a block's
 * type must leave these alone, or the IVR routes stop playing audio.
 */
export const IVR_PLAYBACK_TYPES = ["recorded", "synthetic", "say"] as const;

export function isIvrPlaybackType(type: string | undefined): boolean {
  return (
    type !== undefined &&
    (IVR_PLAYBACK_TYPES as readonly string[]).includes(type)
  );
}

export type ParseMode = "strict" | "permissive";

export type ParseDocumentOptions = {
  mode?: ParseMode;
};

export type ValidateDocumentResult =
  { ok: true; document: ScriptDocument } | { ok: false; errors: string[] };

export type RoutingAnswer = {
  blockId: string;
  value: string;
};

export type RoutingResult = {
  nextPageId: string | null;
  nextBlockId: string | null;
  complete: boolean;
};

export type MergeTagContext = Record<
  string,
  string | number | boolean | null | undefined
>;

export type CreateEmptyDocumentOptions = {
  palette?: ScriptPalette;
  title?: string;
};

export type CallScriptServiceConfig = {
  defaultPalette?: ScriptPalette;
};

export type CallScriptService = {
  parseDocument: (
    input: unknown,
    options?: ParseDocumentOptions,
  ) => ScriptDocument;
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
