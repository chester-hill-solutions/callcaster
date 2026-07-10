import { describe, expect, test } from "bun:test";
import { createCallScriptService } from "./service.js";
import { resetIdCounter } from "./ids.js";
describe("createCallScriptService", () => {
    const scripts = createCallScriptService();
    test("createEmptyDocument returns valid document", () => {
        resetIdCounter();
        const doc = scripts.createEmptyDocument({ palette: "canvass" });
        const result = scripts.validateDocument(doc);
        expect(result.ok).toBe(true);
    });
    test("migrateFromCallcasterFlow round-trips", () => {
        const flow = {
            pages: {
                p1: { id: "p1", title: "Intro", blocks: ["b1"] },
            },
            blocks: {
                b1: { type: "textarea", prompt: "Hello {{name}}" },
            },
        };
        const doc = scripts.migrateFromCallcasterFlow(flow);
        const back = scripts.serializeToCallcasterFlow(doc);
        expect(back.pages.p1?.blocks).toEqual(["b1"]);
        expect(back.blocks.b1?.type).toBe("textarea");
    });
    test("migrateFromCallcasterFlow accepts blockType alias", () => {
        const flow = {
            pages: {
                p1: { id: "p1", title: "Intro", blocks: ["b1"] },
            },
            blocks: {
                b1: { blockType: "instruction", body: "Welcome" },
            },
        };
        const doc = scripts.migrateFromCallcasterFlow(flow);
        expect(doc.blocks.b1?.type).toBe("instruction");
    });
    test("migrateFromQuickCanvassBlocks serializes back", () => {
        resetIdCounter();
        const blocks = [
            { id: "i1", type: "instruction", body: "Knock knock" },
            { id: "y1", type: "yes_no", prompt: "Home?" },
        ];
        const doc = scripts.migrateFromQuickCanvassBlocks(blocks);
        const linear = scripts.serializeToQuickCanvassBlocks(doc);
        expect(linear).toHaveLength(2);
        expect(linear[0]?.type).toBe("instruction");
    });
    test("applyMergeTags replaces tokens", () => {
        const out = scripts.applyMergeTags("Hi {{first_name}}", { first_name: "Alex" });
        expect(out).toBe("Hi Alex");
    });
    test("evaluateRouting finds next unanswered block", () => {
        resetIdCounter();
        const doc = scripts.createEmptyDocument();
        const page = doc.pages[doc.startPageId];
        const blockId = page?.blockIds[0];
        if (!blockId) {
            throw new Error("missing block");
        }
        doc.blocks[blockId] = {
            id: blockId,
            type: "yes_no",
            prompt: "Interested?",
            routingRules: [{ answerValue: "yes", targetPageId: doc.startPageId }],
        };
        const pending = scripts.evaluateRouting(doc, []);
        expect(pending.complete).toBe(false);
        expect(pending.nextBlockId).toBe(blockId);
        const done = scripts.evaluateRouting(doc, [{ blockId, value: "yes" }]);
        expect(done.complete).toBe(true);
    });
});
