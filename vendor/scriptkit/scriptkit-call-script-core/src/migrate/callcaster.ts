import { z } from "zod";
import {
  callcasterFlowSchema,
  type CallcasterFlow,
  type ScriptBlock,
  type ScriptDocument,
} from "../types.js";
import { createId } from "../ids.js";

/**
 * Wire block type -> editor block type.
 *
 * Two vocabularies exist in production `steps` data and both must be readable:
 * - the legacy set that Callcaster's `Result.tsx` actually renders
 *   (`radio | boolean | dropdown | multi | textarea | textblock | audio`), and
 * - the documented set in `docs/script-json-format.md`
 *   (`textarea | select | radio | checkbox`), which is what users are told to
 *   upload.
 *
 * Anything absent here falls through to `textarea`, which is why legacy
 * `dropdown`/`multi` blocks used to open in the editor as plain textareas.
 */
const CALLCASTER_TYPE_MAP: Record<string, ScriptBlock["type"]> = {
  // Documented vocabulary.
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  text: "textarea",
  instruction: "instruction",
  // Legacy vocabulary. `dropdown`/`multi`/`boolean` are what Result.tsx
  // renders as inputs; `infotext` ("Static Text"), `textblock` and `audio` are
  // display-only there (Result.tsx renders their content but no input, since
  // its switch has no case for them). Without these entries they all fell
  // through to `textarea` and opened in the editor as free-text inputs.
  dropdown: "select",
  multi: "checkbox",
  boolean: "checkbox",
  textblock: "instruction",
  infotext: "instruction",
  audio: "instruction",
};

/**
 * Editor block type -> wire type, used only for blocks that have no
 * `callcasterType` (i.e. newly created ones). Existing blocks keep their
 * original wire type via `toWireType`.
 */
const DOC_TO_CALLCASTER_TYPE: Record<ScriptBlock["type"], string> = {
  instruction: "textblock",
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  // Canvass palette types have no Callcaster wire equivalent; map to the
  // nearest renderable type rather than emitting an unknown one.
  yes_no: "radio",
  choice: "select",
  text: "textarea",
  support: "radio",
};

/**
 * Block keys consumed explicitly by `normalizeCallcasterBlock`. Everything
 * else on the wire goes to `wireExtras` and is re-emitted verbatim.
 */
const KNOWN_BLOCK_KEYS = new Set([
  "id",
  "type",
  "blockType",
  "prompt",
  "label",
  "title",
  "body",
  "content",
  "required",
  "options",
  "routingRules",
  "speechType",
  "audioFile",
]);

/** Option keys consumed explicitly. Everything else (e.g. `Icon`) is preserved. */
const KNOWN_OPTION_KEYS = new Set(["value", "label", "content", "next"]);

/** Page keys consumed explicitly. Everything else (e.g. `speechType`, `say`) is preserved. */
const KNOWN_PAGE_KEYS = new Set(["id", "title", "blocks"]);

function collectExtras(
  raw: Record<string, unknown>,
  known: Set<string>,
): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) {
      extras[key] = value;
    }
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * Editor block type -> wire type.
 *
 * A block that came off the wire keeps its original type, always. `steps` is
 * live production data and this package cannot know every type ever written to
 * it — the legacy live-call editor alone could emit `infotext`, which is in no
 * schema here. Gating preservation on "types I recognise" silently rewrote
 * anything unrecognised to `textarea`, turning static text into an input. So
 * the rule is: never rewrite a type we were given.
 *
 * `DOC_TO_CALLCASTER_TYPE` therefore applies only to blocks with no
 * `callcasterType` — i.e. newly authored ones, which is the case that used to
 * emit types `Result.tsx` renders as nothing.
 *
 * NOTE: a future `changeBlockType` in the editor must clear `callcasterType`,
 * or the type change will be invisible on the wire.
 */
function toWireType(block: ScriptBlock): string {
  return (
    block.callcasterType ?? DOC_TO_CALLCASTER_TYPE[block.type] ?? block.type
  );
}

export const callcasterWireBlockSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    blockType: z.string().optional(),
    prompt: z.string().optional(),
    label: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    content: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.unknown()).optional(),
    routingRules: z.array(z.unknown()).optional(),
    speechType: z.string().optional(),
    /** Recorded-audio reference. Must survive a migrate -> serialize round-trip. */
    audioFile: z.string().optional(),
  })
  .passthrough();

function resolveCallcasterBlockType(
  raw: z.infer<typeof callcasterWireBlockSchema>,
): ScriptBlock["type"] {
  const typeRaw = String(raw.type ?? raw.blockType ?? "textarea");
  return CALLCASTER_TYPE_MAP[typeRaw] ?? "textarea";
}

function normalizeCallcasterBlock(
  id: string,
  raw: Record<string, unknown>,
): ScriptBlock {
  const parsed = callcasterWireBlockSchema.parse(raw);
  const mapped = resolveCallcasterBlockType(parsed);
  const prompt = String(
    parsed.prompt ?? parsed.content ?? parsed.label ?? parsed.title ?? "",
  );
  const options = Array.isArray(parsed.options)
    ? parsed.options.map((opt) => {
        if (typeof opt === "string") {
          return { id: createId("opt"), value: opt, label: opt };
        }
        const record = opt as Record<string, unknown>;
        // The Callcaster wire format keys options by { content, next } rather
        // than { value, label } (see docs/script-json-format.md). Derive
        // value/label sensibly from whatever is present, and carry `next`
        // and `content` through verbatim so nothing is lost on round-trip.
        const value = String(
          record.value ?? record.id ?? record.content ?? record.label ?? "",
        );
        const label = String(record.label ?? record.content ?? value);
        const next = typeof record.next === "string" ? record.next : undefined;
        const content =
          typeof record.content === "string" ? record.content : undefined;
        const wireExtras = collectExtras(record, KNOWN_OPTION_KEYS);
        return {
          // Editor-only identity; never serialized. Any `id` that was on the
          // wire stays in wireExtras and is re-emitted from there.
          id: createId("opt"),
          value,
          label,
          ...(next !== undefined ? { next } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(wireExtras !== undefined ? { wireExtras } : {}),
        };
      })
    : [];

  const base = {
    id,
    label: typeof parsed.label === "string" ? parsed.label : undefined,
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    content: typeof parsed.content === "string" ? parsed.content : undefined,
    prompt,
    required: Boolean(parsed.required),
    audioFile:
      typeof parsed.audioFile === "string" ? parsed.audioFile : undefined,
    callcasterType:
      typeof parsed.type === "string"
        ? parsed.type
        : typeof parsed.blockType === "string"
          ? parsed.blockType
          : undefined,
    speechType:
      typeof parsed.speechType === "string" ? parsed.speechType : undefined,
    routingRules: Array.isArray(parsed.routingRules)
      ? parsed.routingRules.map((rule) => {
          const r = rule as Record<string, unknown>;
          return {
            answerValue: String(r.answerValue ?? r.value ?? ""),
            targetPageId: r.targetPageId ? String(r.targetPageId) : undefined,
            targetBlockId: r.targetBlockId
              ? String(r.targetBlockId)
              : undefined,
          };
        })
      : undefined,
    wireExtras: collectExtras(raw, KNOWN_BLOCK_KEYS),
  };

  switch (mapped) {
    case "instruction":
      return {
        ...base,
        type: "instruction",
        body: String(parsed.body ?? parsed.content ?? prompt),
      };
    case "select":
      return { ...base, type: "select", options, prompt };
    case "radio":
      return { ...base, type: "radio", options, prompt };
    case "checkbox":
      return { ...base, type: "checkbox", options, prompt };
    case "textarea":
    default:
      return {
        ...base,
        type: "textarea",
        prompt,
        ...(options.length > 0 ? { options } : {}),
      };
  }
}

export function migrateFromCallcasterFlow(flow: unknown): ScriptDocument {
  const parsed = callcasterFlowSchema.parse(flow);
  const pages: ScriptDocument["pages"] = {};
  const blocks: ScriptDocument["blocks"] = {};

  for (const [pageId, page] of Object.entries(parsed.pages)) {
    const id = page.id ?? pageId;
    pages[id] = {
      id,
      title: page.title ?? "Page",
      blockIds: [...(page.blocks ?? [])],
      wireExtras: collectExtras(
        page as Record<string, unknown>,
        KNOWN_PAGE_KEYS,
      ),
    };
  }

  for (const [blockId, rawBlock] of Object.entries(parsed.blocks)) {
    blocks[blockId] = normalizeCallcasterBlock(blockId, rawBlock);
  }

  // Prefer the persisted order; fall back to key order for scripts written
  // before `pageOrder` existed. Filter to pages that still exist, then append
  // any page the stored order doesn't mention, so no page becomes unreachable.
  const storedOrder = (parsed.pageOrder ?? []).filter((id) => pages[id]);
  const pageOrder = [
    ...storedOrder,
    ...Object.keys(pages).filter((id) => !storedOrder.includes(id)),
  ];

  const startPageId =
    parsed.startPageId && pages[parsed.startPageId]
      ? parsed.startPageId
      : (pageOrder[0] ?? createId("page"));

  if (!pages[startPageId]) {
    pages[startPageId] = { id: startPageId, title: "Page 1", blockIds: [] };
    pageOrder.push(startPageId);
  }

  return { version: 1, startPageId, pageOrder, pages, blocks };
}

export function serializeToCallcasterFlow(doc: ScriptDocument): CallcasterFlow {
  const pages: CallcasterFlow["pages"] = {};
  const blocks: CallcasterFlow["blocks"] = {};

  // Emit in pageOrder so the JSON reads in the authored order. Note this is
  // cosmetic only: jsonb re-sorts object keys on write, which is exactly why
  // `pageOrder` is persisted as an array alongside it.
  //
  // Tolerate a missing pageOrder: this is a published package and callers can
  // hand-build a ScriptDocument without going through the schema's default.
  const storedOrder = doc.pageOrder ?? [];
  const orderedPageIds = [
    ...storedOrder.filter((id) => doc.pages[id]),
    ...Object.keys(doc.pages).filter((id) => !storedOrder.includes(id)),
  ];

  for (const pageId of orderedPageIds) {
    const page = doc.pages[pageId];
    if (!page) continue;
    pages[page.id] = {
      // Spread unmodelled keys first so known fields always win.
      ...(page.wireExtras ?? {}),
      id: page.id,
      title: page.title,
      blocks: [...page.blockIds],
    };
  }

  for (const block of Object.values(doc.blocks)) {
    const wire: Record<string, unknown> = {
      // Spread unmodelled keys first so known fields always win.
      ...(block.wireExtras ?? {}),
      id: block.id,
      type: toWireType(block),
      prompt: "prompt" in block ? block.prompt : undefined,
      label: block.label,
      title: block.title,
      content: block.content,
      required: block.required,
      routingRules: block.routingRules,
      audioFile: block.audioFile,
      speechType: block.speechType,
    };

    if (block.type === "instruction") {
      wire.body = block.body;
    }

    if ("options" in block && block.options) {
      // Emit both the internal { value, label } shape and the Callcaster
      // wire's { content, next } shape so a migrate -> serialize round-trip
      // doesn't drop routing (`next`) or the original option text. `id` is
      // editor-only and deliberately not emitted.
      wire.options = block.options.map((option) => ({
        ...(option.wireExtras ?? {}),
        value: option.value,
        label: option.label,
        content: option.content ?? option.label ?? option.value,
        next: option.next,
      }));
    }

    blocks[block.id] = wire;
  }

  return {
    startPageId: doc.startPageId,
    pageOrder: orderedPageIds,
    pages,
    blocks,
  };
}
