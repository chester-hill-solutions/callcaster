import { scriptDocumentSchema, quickCanvassBlockSchema, } from "./types.js";
import { createId } from "./ids.js";
export function parseDocument(input, options = {}) {
    const mode = options.mode ?? "strict";
    if (mode === "permissive" && input && typeof input === "object") {
        const candidate = input;
        if (!candidate.version) {
            return scriptDocumentSchema.parse({ ...candidate, version: 1 });
        }
    }
    return scriptDocumentSchema.parse(input);
}
export function validateDocument(doc) {
    const result = scriptDocumentSchema.safeParse(doc);
    if (!result.success) {
        return {
            ok: false,
            errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        };
    }
    const document = result.data;
    const errors = [];
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
export function createEmptyDocument(options = {}) {
    const pageId = createId("page");
    const blockId = createId("block");
    const title = options.title ?? "Page 1";
    const instructionBlock = {
        id: blockId,
        type: "instruction",
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
export function parseQuickCanvassBlocks(input) {
    return quickCanvassBlockSchema.array().parse(input);
}
