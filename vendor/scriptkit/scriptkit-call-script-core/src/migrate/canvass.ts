import {
  CANVASS_BLOCK_TYPES,
  quickCanvassBlockSchema,
  type QuickCanvassBlock,
  type ScriptDocument,
} from "../types.js";
import { createId } from "../ids.js";

type CanvassBlockType = (typeof CANVASS_BLOCK_TYPES)[number];

const CANVASS_TYPES: ReadonlySet<string> = new Set(CANVASS_BLOCK_TYPES);

function isCanvassBlockType(type: string): type is CanvassBlockType {
  return CANVASS_TYPES.has(type);
}

export function migrateFromQuickCanvassBlocks(blocksInput: unknown): ScriptDocument {
  const linear = quickCanvassBlockSchema.array().parse(blocksInput);
  const pageId = createId("page");
  const blockIds: string[] = [];
  const blocks: ScriptDocument["blocks"] = {};

  for (const item of linear) {
    const id = item.id || createId("block");
    blockIds.push(id);

    if (item.type === "instruction") {
      blocks[id] = {
        id,
        type: "instruction",
        body: item.body ?? item.prompt ?? "",
        prompt: item.prompt,
        required: item.required,
      };
      continue;
    }

    if (item.type === "yes_no") {
      blocks[id] = {
        id,
        type: "yes_no",
        prompt: item.prompt ?? "",
        required: item.required,
      };
      continue;
    }

    if (item.type === "choice") {
      blocks[id] = {
        id,
        type: "choice",
        prompt: item.prompt ?? "",
        options: item.options ?? [],
        required: item.required,
      };
      continue;
    }

    if (item.type === "text") {
      blocks[id] = {
        id,
        type: "text",
        prompt: item.prompt ?? "",
        placeholder: item.placeholder,
        required: item.required,
      };
      continue;
    }

    blocks[id] = {
      id,
      type: "support",
      prompt: item.prompt ?? "",
      required: item.required,
    };
  }

  return {
    version: 1,
    startPageId: pageId,
    pages: {
      [pageId]: {
        id: pageId,
        title: "Canvass script",
        blockIds,
      },
    },
    blocks,
  };
}

export function serializeToQuickCanvassBlocks(doc: ScriptDocument): QuickCanvassBlock[] {
  const startPage = doc.pages[doc.startPageId];
  if (!startPage) {
    return [];
  }

  const output: QuickCanvassBlock[] = [];

  for (const blockId of startPage.blockIds) {
    const block = doc.blocks[blockId];
    if (!block || !isCanvassBlockType(block.type)) {
      continue;
    }

    switch (block.type) {
      case "instruction":
        output.push({
          id: block.id,
          type: "instruction",
          body: block.body,
          prompt: block.prompt,
          required: block.required,
        });
        break;
      case "yes_no":
        output.push({
          id: block.id,
          type: "yes_no",
          prompt: block.prompt,
          required: block.required,
        });
        break;
      case "choice":
        output.push({
          id: block.id,
          type: "choice",
          prompt: block.prompt,
          options: block.options,
          required: block.required,
        });
        break;
      case "text":
        output.push({
          id: block.id,
          type: "text",
          prompt: block.prompt,
          placeholder: block.placeholder,
          required: block.required,
        });
        break;
      case "support":
        output.push({
          id: block.id,
          type: "support",
          prompt: block.prompt,
          required: block.required,
        });
        break;
      default: {
        const _exhaustive: never = block.type;
        throw new Error(`Unsupported canvass block type: ${String(_exhaustive)}`);
      }
    }
  }

  return output;
}
