import { applyMergeTags } from "./merge-tags.js";
import {
  migrateFromCallcasterFlow,
  migrateFromQuickCanvassBlocks,
  serializeToCallcasterFlow,
  serializeToQuickCanvassBlocks,
} from "./migrate/index.js";
import { createEmptyDocument, parseDocument, validateDocument } from "./parse.js";
import { evaluateRouting } from "./routing.js";
import type { CallScriptService, CallScriptServiceConfig } from "./types.js";

export function createCallScriptService(_config: CallScriptServiceConfig = {}): CallScriptService {
  return {
    parseDocument,
    validateDocument,
    migrateFromCallcasterFlow,
    serializeToCallcasterFlow,
    migrateFromQuickCanvassBlocks,
    serializeToQuickCanvassBlocks,
    evaluateRouting,
    applyMergeTags,
    createEmptyDocument,
  };
}
