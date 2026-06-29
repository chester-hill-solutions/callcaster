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
  })
  .passthrough();

function resolveCallcasterBlockType(raw: z.infer<typeof callcasterWireBlockSchema>): ScriptBlock["type"] {
  const typeRaw = String(raw.type ?? raw.blockType ?? "textarea");
  return CALLCASTER_TYPE_MAP[typeRaw] ?? "textarea";
}

function normalizeCallcasterBlock(id: string, raw: Record<string, unknown>): ScriptBlock {
  const parsed = callcasterWireBlockSchema.parse(raw);
  const mapped = resolveCallcasterBlockType(parsed);
  const prompt = String(parsed.prompt ?? parsed.label ?? parsed.title ?? "");
  const options = Array.isArray(parsed.options)
    ? parsed.options.map((opt) => {
        if (typeof opt === "string") {
          return { value: opt, label: opt };
        }
        const record = opt as Record<string, unknown>;
        const value = String(record.value ?? record.id ?? record.label ?? "");
        return { value, label: String(record.label ?? value) };
      })
    : [];

  const base = {
    id,
    label: typeof parsed.label === "string" ? parsed.label : undefined,
    prompt,
    required: Boolean(parsed.required),
    routingRules: Array.isArray(parsed.routingRules)
      ? parsed.routingRules.map((rule) => {
          const r = rule as Record<string, unknown>;
          return {
            answerValue: String(r.answerValue ?? r.value ?? ""),
            targetPageId: r.targetPageId ? String(r.targetPageId) : undefined,
            targetBlockId: r.targetBlockId ? String(r.targetBlockId) : undefined,
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
      return { ...base, type: "textarea", prompt };
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
      type: block.type === "instruction" ? "instruction" : block.type,
      prompt: "prompt" in block ? block.prompt : undefined,
      label: block.label,
      required: block.required,
      routingRules: block.routingRules,
    };

    if (block.type === "instruction") {
      wire.body = block.body;
    }

    if ("options" in block && block.options) {
      wire.options = block.options;
    }

    blocks[block.id] = wire;
  }

  return { pages, blocks };
}
