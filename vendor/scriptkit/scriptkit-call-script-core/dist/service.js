import { applyMergeTags } from "./merge-tags.js";
import { migrateFromCallcasterFlow, migrateFromQuickCanvassBlocks, serializeToCallcasterFlow, serializeToQuickCanvassBlocks, } from "./migrate/index.js";
import { createEmptyDocument, parseDocument, validateDocument } from "./parse.js";
import { evaluateRouting } from "./routing.js";
export function createCallScriptService(_config = {}) {
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
