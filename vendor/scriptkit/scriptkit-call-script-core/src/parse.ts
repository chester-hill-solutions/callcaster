import {
  scriptDocumentSchema,
  quickCanvassBlockSchema,
  type ParseDocumentOptions,
  type ScriptDocument,
  type ScriptPalette,
  type ValidateDocumentResult,
} from "./types.js";
import { createId } from "./ids.js";

export function parseDocument(input: unknown, options: ParseDocumentOptions = {}): ScriptDocument {
  const mode = options.mode ?? "strict";
  if (mode === "permissive" && input && typeof input === "object") {
    const candidate = input as Record<string, unknown>;
    if (!candidate.version) {
      return scriptDocumentSchema.parse({ ...candidate, version: 1 });
    }
  }
  return scriptDocumentSchema.parse(input);
}

export function validateDocument(doc: unknown): ValidateDocumentResult {
  const result = scriptDocumentSchema.safeParse(doc);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const document = result.data;
  const errors: string[] = [];

  if (!document.pages[document.startPageId]) {
    errors.push(`startPageId "${document.startPageId}" not found in pages`);
  }

  for (const page of Object.values(document.pages)) {
    for (const blockId of page.blockIds) {
      if (!document.blocks[blockId]) {
        errors.push(`page "${page.id}" references missing block "${blockId}"`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, document };
}

export function createEmptyDocument(options: {
  palette?: ScriptPalette;
  title?: string;
} = {}): ScriptDocument {
  const pageId = createId("page");
  const blockId = createId("block");
  const title = options.title ?? "Page 1";

  const instructionBlock = {
    id: blockId,
    type: "instruction" as const,
    body: "Welcome script",
    prompt: "",
  };

  return {
    version: 1,
    startPageId: pageId,
    pages: {
      [pageId]: {
        id: pageId,
        title,
        blockIds: [blockId],
      },
    },
    blocks: {
      [blockId]: instructionBlock,
    },
  };
}

export function parseQuickCanvassBlocks(input: unknown) {
  return quickCanvassBlockSchema.array().parse(input);
}
