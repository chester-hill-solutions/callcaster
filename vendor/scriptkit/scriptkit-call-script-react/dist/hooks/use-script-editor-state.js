import { useMemo, useState } from "react";
import { CANVASS_BLOCK_TYPES, CALLCASTER_BLOCK_TYPES, createCallScriptService, isIvrPlaybackType, } from "@chester-hill-solutions/scriptkit-call-script-core";
import { createId } from "../ids.js";
const scripts = createCallScriptService();
/** Move `from` to `to` within a copy of `list`. Out-of-range indices no-op. */
function moveWithin(list, from, to) {
    const next = [...list];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length) {
        return next;
    }
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
        return next;
    }
    next.splice(to, 0, moved);
    return next;
}
export function useScriptEditorState(options) {
    const [document, setDocument] = useState(options.initialDocument);
    const [activePageId, setActivePageId] = useState(options.initialDocument.startPageId);
    const [activeBlockId, setActiveBlockId] = useState(null);
    // Adopt a new document prop during render rather than in an effect: an effect
    // would render once with stale state first. Active ids are kept when they
    // still resolve, so a controlled parent re-supplying the document doesn't
    // throw away the user's place in it.
    const [prevInitialDocument, setPrevInitialDocument] = useState(options.initialDocument);
    if (prevInitialDocument !== options.initialDocument) {
        setPrevInitialDocument(options.initialDocument);
        setDocument(options.initialDocument);
        setActivePageId((current) => options.initialDocument.pages[current]
            ? current
            : options.initialDocument.startPageId);
        setActiveBlockId((current) => current && options.initialDocument.blocks[current] ? current : null);
    }
    const palette = options.palette ?? "callcaster";
    const blockTypes = palette === "canvass" ? CANVASS_BLOCK_TYPES : CALLCASTER_BLOCK_TYPES;
    const updateDocument = (next) => {
        setDocument(next);
        options.onChange?.(next);
    };
    const pageOrder = document.pageOrder ?? Object.keys(document.pages);
    const activePage = document.pages[activePageId];
    const orderedPages = useMemo(() => pageOrder
        .map((id) => document.pages[id])
        .filter((page) => page !== undefined), [document, pageOrder]);
    // ---------------------------------------------------------------- pages
    const addPage = (title) => {
        const pageId = createId("page");
        updateDocument({
            ...document,
            pageOrder: [...pageOrder, pageId],
            pages: {
                ...document.pages,
                [pageId]: {
                    id: pageId,
                    title: title ?? `Page ${pageOrder.length + 1}`,
                    blockIds: [],
                },
            },
        });
        setActivePageId(pageId);
        setActiveBlockId(null);
        return pageId;
    };
    const renamePage = (pageId, title) => {
        const page = document.pages[pageId];
        if (!page) {
            return;
        }
        updateDocument({
            ...document,
            pages: { ...document.pages, [pageId]: { ...page, title } },
        });
    };
    /**
     * Remove a page, the blocks it owned, and any routing that pointed at either.
     * Leaving a dangling `next` behind would fail validateDocument and strand a
     * caller mid-script, so the cleanup is not optional.
     */
    const removePage = (pageId) => {
        const page = document.pages[pageId];
        // A script must have somewhere to start.
        if (!page || pageOrder.length <= 1) {
            return;
        }
        const orphanedIds = new Set([pageId, ...page.blockIds]);
        const nextPageOrder = pageOrder.filter((id) => id !== pageId);
        const nextPages = {};
        for (const id of nextPageOrder) {
            const candidate = document.pages[id];
            if (candidate) {
                nextPages[id] = candidate;
            }
        }
        const nextBlocks = {};
        for (const [id, block] of Object.entries(document.blocks)) {
            if (orphanedIds.has(id)) {
                continue;
            }
            nextBlocks[id] = clearDanglingRouting(block, orphanedIds);
        }
        updateDocument({
            ...document,
            startPageId: document.startPageId === pageId
                ? (nextPageOrder[0] ?? document.startPageId)
                : document.startPageId,
            pageOrder: nextPageOrder,
            pages: nextPages,
            blocks: nextBlocks,
        });
        if (activePageId === pageId) {
            setActivePageId(nextPageOrder[0] ?? document.startPageId);
            setActiveBlockId(null);
        }
    };
    const movePage = (pageId, toIndex) => {
        const from = pageOrder.indexOf(pageId);
        if (from === -1) {
            return;
        }
        updateDocument({ ...document, pageOrder: moveWithin(pageOrder, from, toIndex) });
    };
    const setStartPage = (pageId) => {
        if (!document.pages[pageId]) {
            return;
        }
        updateDocument({ ...document, startPageId: pageId });
    };
    // --------------------------------------------------------------- blocks
    const addBlock = (type, atIndex) => {
        const blockId = createId("block");
        const page = document.pages[activePageId];
        if (!page) {
            return blockId;
        }
        const blockIds = [...page.blockIds];
        blockIds.splice(atIndex ?? blockIds.length, 0, blockId);
        updateDocument({
            ...document,
            pages: { ...document.pages, [activePageId]: { ...page, blockIds } },
            blocks: { ...document.blocks, [blockId]: createBlock(type, blockId) },
        });
        setActiveBlockId(blockId);
        return blockId;
    };
    const updateBlock = (blockId, patch) => {
        const existing = document.blocks[blockId];
        if (!existing) {
            return;
        }
        updateDocument({
            ...document,
            blocks: { ...document.blocks, [blockId]: patchBlock(existing, patch) },
        });
    };
    const removeBlock = (blockId) => {
        const page = document.pages[activePageId];
        if (!page) {
            return;
        }
        const { [blockId]: _removed, ...restBlocks } = document.blocks;
        void _removed;
        const orphaned = new Set([blockId]);
        const nextBlocks = {};
        for (const [id, block] of Object.entries(restBlocks)) {
            nextBlocks[id] = clearDanglingRouting(block, orphaned);
        }
        updateDocument({
            ...document,
            pages: {
                ...document.pages,
                [activePageId]: {
                    ...page,
                    blockIds: page.blockIds.filter((id) => id !== blockId),
                },
            },
            blocks: nextBlocks,
        });
        if (activeBlockId === blockId) {
            setActiveBlockId(null);
        }
    };
    const duplicateBlock = (blockId) => {
        const page = document.pages[activePageId];
        const source = document.blocks[blockId];
        if (!page || !source) {
            return blockId;
        }
        const copyId = createId("block");
        // Fresh option ids: they are editor identity, so a copy sharing them would
        // make edits to one option apply to both blocks' rows.
        const copy = {
            ...source,
            id: copyId,
            ...("options" in source && source.options
                ? {
                    options: source.options.map((option) => ({
                        ...option,
                        id: createId("opt"),
                    })),
                }
                : {}),
        };
        const blockIds = [...page.blockIds];
        blockIds.splice(page.blockIds.indexOf(blockId) + 1, 0, copyId);
        updateDocument({
            ...document,
            pages: { ...document.pages, [activePageId]: { ...page, blockIds } },
            blocks: { ...document.blocks, [copyId]: copy },
        });
        setActiveBlockId(copyId);
        return copyId;
    };
    const moveBlock = (blockId, toIndex) => {
        const page = document.pages[activePageId];
        if (!page) {
            return;
        }
        const from = page.blockIds.indexOf(blockId);
        if (from === -1) {
            return;
        }
        updateDocument({
            ...document,
            pages: {
                ...document.pages,
                [activePageId]: {
                    ...page,
                    blockIds: moveWithin(page.blockIds, from, toIndex),
                },
            },
        });
    };
    const moveBlockToPage = (blockId, toPageId, toIndex) => {
        const fromPage = document.pages[activePageId];
        const toPage = document.pages[toPageId];
        if (!fromPage || !toPage || fromPage.id === toPage.id) {
            return;
        }
        const nextToBlockIds = [...toPage.blockIds];
        nextToBlockIds.splice(toIndex ?? nextToBlockIds.length, 0, blockId);
        updateDocument({
            ...document,
            pages: {
                ...document.pages,
                [fromPage.id]: {
                    ...fromPage,
                    blockIds: fromPage.blockIds.filter((id) => id !== blockId),
                },
                [toPageId]: { ...toPage, blockIds: nextToBlockIds },
            },
        });
    };
    /**
     * Change a block's input type, keeping whatever content the new type can hold.
     *
     * Clears `callcasterType` so the change is visible on the wire — serialization
     * prefers the original wire type, so leaving it set would make this a no-op
     * once saved. IVR playback blocks are exempt: there `callcasterType` carries
     * the playback mode rather than an input type, and dropping it would stop the
     * IVR routes playing audio.
     */
    const changeBlockType = (blockId, type) => {
        const existing = document.blocks[blockId];
        if (!existing || existing.type === type) {
            return;
        }
        if (isIvrPlaybackType(existing.callcasterType)) {
            return;
        }
        const carried = {
            id: existing.id,
            label: existing.label,
            title: existing.title,
            content: existing.content,
            required: existing.required,
            audioFile: existing.audioFile,
            speechType: existing.speechType,
            routingRules: existing.routingRules,
            wireExtras: existing.wireExtras,
            callcasterType: undefined,
        };
        const prompt = "prompt" in existing ? (existing.prompt ?? "") : "";
        const options = "options" in existing && existing.options ? existing.options : [];
        const next = createBlock(type, blockId);
        updateDocument({
            ...document,
            blocks: {
                ...document.blocks,
                [blockId]: {
                    ...next,
                    ...carried,
                    ...("prompt" in next ? { prompt } : {}),
                    ...(next.type === "instruction"
                        ? { body: existing.type === "instruction" ? existing.body : prompt }
                        : {}),
                    ...("options" in next ? { options } : {}),
                },
            },
        });
    };
    // -------------------------------------------------------------- options
    const patchOptions = (blockId, map) => {
        const block = document.blocks[blockId];
        if (!block || !("options" in block)) {
            return;
        }
        updateBlock(blockId, {
            options: map(block.options ?? []),
        });
    };
    const addOption = (blockId) => {
        const optionId = createId("opt");
        patchOptions(blockId, (options) => [
            ...options,
            { id: optionId, value: "", label: "" },
        ]);
        return optionId;
    };
    /**
     * Address one option by its stable id.
     *
     * This is why `ScriptOption.id` exists. The previous editor round-tripped a
     * textarea of `value:label` lines and re-matched options by `value`, so
     * editing a value broke the match and fell back to positional lookup —
     * silently moving that option's `next` target onto a different option.
     */
    const updateOption = (blockId, optionId, patch) => {
        patchOptions(blockId, (options) => options.map((option) => option.id === optionId ? { ...option, ...patch } : option));
    };
    const removeOption = (blockId, optionId) => {
        patchOptions(blockId, (options) => options.filter((option) => option.id !== optionId));
    };
    const moveOption = (blockId, optionId, toIndex) => {
        patchOptions(blockId, (options) => {
            const from = options.findIndex((option) => option.id === optionId);
            return from === -1 ? options : moveWithin(options, from, toIndex);
        });
    };
    // -------------------------------------------------------------- routing
    /** Every place an option's `next` can legally point, labelled for humans. */
    const routingTargets = useMemo(() => {
        const targets = orderedPages.map((page) => ({
            kind: "page",
            id: page.id,
            label: page.title,
        }));
        for (const page of orderedPages) {
            for (const blockId of page.blockIds) {
                const block = document.blocks[blockId];
                if (!block) {
                    continue;
                }
                targets.push({
                    kind: "block",
                    id: blockId,
                    label: blockLabel(block),
                    pageTitle: page.title,
                });
            }
        }
        targets.push({ kind: "special", id: "hangup", label: "Hang up" });
        return targets;
    }, [document, orderedPages]);
    /** Ids of options routing to `targetId`, so a delete can say what it breaks. */
    const incomingRefs = (targetId) => {
        const refs = [];
        for (const block of Object.values(document.blocks)) {
            if (!("options" in block) || !block.options) {
                continue;
            }
            for (const option of block.options) {
                if (option.next === targetId) {
                    refs.push(block.id);
                }
            }
        }
        return refs;
    };
    const validation = useMemo(() => scripts.validateDocument(document), [document]);
    return {
        document,
        activePageId,
        activePage,
        activeBlockId,
        blockTypes,
        orderedPages,
        pageOrder,
        routingTargets,
        incomingRefs,
        setActivePageId,
        setActiveBlockId,
        addPage,
        renamePage,
        removePage,
        movePage,
        setStartPage,
        addBlock,
        updateBlock,
        removeBlock,
        duplicateBlock,
        moveBlock,
        moveBlockToPage,
        changeBlockType,
        addOption,
        updateOption,
        removeOption,
        moveOption,
        validation,
        setDocument: updateDocument,
    };
}
/** Best human-readable name for a block, never its generated id. */
export function blockLabel(block) {
    const text = block.title?.trim() ||
        ("prompt" in block ? block.prompt?.trim() : "") ||
        (block.type === "instruction" ? block.body?.trim() : "") ||
        "";
    if (!text) {
        return "Untitled block";
    }
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
/** Drop `next` targets that point at something no longer in the document. */
function clearDanglingRouting(block, removedIds) {
    if (!("options" in block) || !block.options) {
        return block;
    }
    if (!block.options.some((option) => option.next && removedIds.has(option.next))) {
        return block;
    }
    return patchBlock(block, {
        options: block.options.map((option) => option.next && removedIds.has(option.next)
            ? { ...option, next: undefined }
            : option),
    });
}
function patchBlock(existing, patch) {
    switch (existing.type) {
        case "instruction":
            return { ...existing, ...patch, type: "instruction" };
        case "yes_no":
            return { ...existing, ...patch, type: "yes_no" };
        case "choice":
            return { ...existing, ...patch, type: "choice" };
        case "text":
            return { ...existing, ...patch, type: "text" };
        case "support":
            return { ...existing, ...patch, type: "support" };
        case "textarea":
            return { ...existing, ...patch, type: "textarea" };
        case "select":
            return { ...existing, ...patch, type: "select" };
        case "radio":
            return { ...existing, ...patch, type: "radio" };
        case "checkbox":
            return { ...existing, ...patch, type: "checkbox" };
        default: {
            const _exhaustive = existing;
            throw new Error(`Unsupported block type: ${String(_exhaustive)}`);
        }
    }
}
function createBlock(type, id) {
    switch (type) {
        case "instruction":
            return { id, type: "instruction", body: "", prompt: "" };
        case "yes_no":
            return { id, type: "yes_no", prompt: "" };
        case "choice":
            return { id, type: "choice", prompt: "", options: [] };
        case "text":
            return { id, type: "text", prompt: "", placeholder: "" };
        case "support":
            return { id, type: "support", prompt: "" };
        case "textarea":
            return { id, type: "textarea", prompt: "" };
        case "select":
            return { id, type: "select", prompt: "", options: [] };
        case "radio":
            return { id, type: "radio", prompt: "", options: [] };
        case "checkbox":
            return { id, type: "checkbox", prompt: "", options: [] };
        default: {
            const _exhaustive = type;
            throw new Error(`Unsupported block type: ${String(_exhaustive)}`);
        }
    }
}
