import { callcasterFlowSchema, quickCanvassBlockSchema, } from "./types.js";
import { createId } from "./ids.js";
const CALLCASTER_TYPE_MAP = {
    textarea: "textarea",
    select: "select",
    radio: "radio",
    checkbox: "checkbox",
    text: "textarea",
    instruction: "instruction",
};
const CANVASS_TYPES = new Set(["instruction", "yes_no", "choice", "text", "support"]);
function normalizeCallcasterBlock(id, raw) {
    const typeRaw = String(raw.type ?? raw.blockType ?? "textarea");
    const mapped = CALLCASTER_TYPE_MAP[typeRaw] ?? "textarea";
    const prompt = String(raw.prompt ?? raw.label ?? raw.title ?? "");
    const options = Array.isArray(raw.options)
        ? raw.options.map((opt) => {
            if (typeof opt === "string") {
                return { value: opt, label: opt };
            }
            const record = opt;
            const value = String(record.value ?? record.id ?? record.label ?? "");
            return { value, label: String(record.label ?? value) };
        })
        : [];
    const base = {
        id,
        label: typeof raw.label === "string" ? raw.label : undefined,
        prompt,
        required: Boolean(raw.required),
        routingRules: Array.isArray(raw.routingRules)
            ? raw.routingRules.map((rule) => {
                const r = rule;
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
                body: String(raw.body ?? raw.content ?? prompt),
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
export function migrateFromCallcasterFlow(flow) {
    const parsed = callcasterFlowSchema.parse(flow);
    const pages = {};
    const blocks = {};
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
export function serializeToCallcasterFlow(doc) {
    const pages = {};
    const blocks = {};
    for (const page of Object.values(doc.pages)) {
        pages[page.id] = {
            id: page.id,
            title: page.title,
            blocks: [...page.blockIds],
        };
    }
    for (const block of Object.values(doc.blocks)) {
        const wire = {
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
export function migrateFromQuickCanvassBlocks(blocksInput) {
    const linear = quickCanvassBlockSchema.array().parse(blocksInput);
    const pageId = createId("page");
    const blockIds = [];
    const blocks = {};
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
export function serializeToQuickCanvassBlocks(doc) {
    const startPage = doc.pages[doc.startPageId];
    if (!startPage) {
        return [];
    }
    const output = [];
    for (const blockId of startPage.blockIds) {
        const block = doc.blocks[blockId];
        if (!block || !CANVASS_TYPES.has(block.type)) {
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
        }
    }
    return output;
}
