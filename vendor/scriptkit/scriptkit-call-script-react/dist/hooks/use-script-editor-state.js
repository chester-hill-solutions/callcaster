import { useMemo, useState } from "react";
import { CANVASS_BLOCK_TYPES, CALLCASTER_BLOCK_TYPES, createCallScriptService, } from "@chester-hill-solutions/scriptkit-call-script-core";
import { createId } from "../ids.js";
const scripts = createCallScriptService();
export function useScriptEditorState(options) {
    const [document, setDocument] = useState(options.initialDocument);
    const [activePageId, setActivePageId] = useState(options.initialDocument.startPageId);
    const [activeBlockId, setActiveBlockId] = useState(null);
    const palette = options.palette ?? "callcaster";
    const blockTypes = palette === "canvass" ? CANVASS_BLOCK_TYPES : CALLCASTER_BLOCK_TYPES;
    const updateDocument = (next) => {
        setDocument(next);
        options.onChange?.(next);
    };
    const activePage = document.pages[activePageId];
    const addBlock = (type) => {
        const blockId = createId("block");
        const page = document.pages[activePageId];
        if (!page) {
            return;
        }
        const block = createBlock(type, blockId);
        updateDocument({
            ...document,
            pages: {
                ...document.pages,
                [activePageId]: {
                    ...page,
                    blockIds: [...page.blockIds, blockId],
                },
            },
            blocks: {
                ...document.blocks,
                [blockId]: block,
            },
        });
        setActiveBlockId(blockId);
    };
    const updateBlock = (blockId, patch) => {
        const existing = document.blocks[blockId];
        if (!existing) {
            return;
        }
        updateDocument({
            ...document,
            blocks: {
                ...document.blocks,
                [blockId]: { ...existing, ...patch },
            },
        });
    };
    const removeBlock = (blockId) => {
        const page = document.pages[activePageId];
        if (!page) {
            return;
        }
        const { [blockId]: _removed, ...restBlocks } = document.blocks;
        void _removed;
        updateDocument({
            ...document,
            pages: {
                ...document.pages,
                [activePageId]: {
                    ...page,
                    blockIds: page.blockIds.filter((id) => id !== blockId),
                },
            },
            blocks: restBlocks,
        });
        if (activeBlockId === blockId) {
            setActiveBlockId(null);
        }
    };
    const validation = useMemo(() => scripts.validateDocument(document), [document]);
    return {
        document,
        activePageId,
        activePage,
        activeBlockId,
        blockTypes,
        setActivePageId,
        setActiveBlockId,
        addBlock,
        updateBlock,
        removeBlock,
        validation,
        setDocument: updateDocument,
    };
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
