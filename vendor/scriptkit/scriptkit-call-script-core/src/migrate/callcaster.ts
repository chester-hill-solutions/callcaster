import { z } from "zod";
import {
  callcasterFlowSchema,
  type CallcasterFlow,
  type ScriptBlock,
  type ScriptDocument,
} from "../types.js";
import { createId } from "../ids.js";

const CALLCASTER_TYPE_MAP: Record<string, ScriptBlock["type"]> = {
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  text: "textarea",
  instruction: "instruction",
};

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
          return { value: opt, label: opt };
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
        return {
          value,
          label,
          ...(next !== undefined ? { next } : {}),
          ...(content !== undefined ? { content } : {}),
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
    };
  }

  for (const [blockId, rawBlock] of Object.entries(parsed.blocks)) {
    blocks[blockId] = normalizeCallcasterBlock(blockId, rawBlock);
  }

  const startPageId = Object.keys(pages)[0] ?? createId("page");
  if (!pages[startPageId]) {
    pages[startPageId] = { id: startPageId, title: "Page 1", blockIds: [] };
  }

  return { version: 1, startPageId, pages, blocks };
}

export function serializeToCallcasterFlow(doc: ScriptDocument): CallcasterFlow {
  const pages: CallcasterFlow["pages"] = {};
  const blocks: CallcasterFlow["blocks"] = {};

  for (const page of Object.values(doc.pages)) {
    pages[page.id] = {
      id: page.id,
      title: page.title,
      blocks: [...page.blockIds],
    };
  }

  for (const block of Object.values(doc.blocks)) {
    const wire: Record<string, unknown> = {
      id: block.id,
      type:
        block.callcasterType ??
        (block.type === "instruction" ? "instruction" : block.type),
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
      // doesn't drop routing (`next`) or the original option text.
      wire.options = block.options.map((option) => ({
        value: option.value,
        label: option.label,
        content: option.content ?? option.label ?? option.value,
        next: option.next,
      }));
    }

    blocks[block.id] = wire;
  }

  return { pages, blocks };
}
