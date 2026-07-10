"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bun_test_1 = require("bun:test");
var service_js_1 = require("./service.js");
var ids_js_1 = require("./ids.js");
(0, bun_test_1.describe)("createCallScriptService", function () {
    var scripts = (0, service_js_1.createCallScriptService)();
    (0, bun_test_1.test)("createEmptyDocument returns valid document", function () {
        (0, ids_js_1.resetIdCounter)();
        var doc = scripts.createEmptyDocument({ palette: "canvass" });
        var result = scripts.validateDocument(doc);
        (0, bun_test_1.expect)(result.ok).toBe(true);
    });
    (0, bun_test_1.test)("migrateFromCallcasterFlow round-trips", function () {
        var _a, _b;
        var flow = {
            pages: {
                p1: { id: "p1", title: "Intro", blocks: ["b1"] },
            },
            blocks: {
                b1: { type: "textarea", prompt: "Hello {{name}}" },
            },
        };
        var doc = scripts.migrateFromCallcasterFlow(flow);
        var back = scripts.serializeToCallcasterFlow(doc);
        (0, bun_test_1.expect)((_a = back.pages.p1) === null || _a === void 0 ? void 0 : _a.blocks).toEqual(["b1"]);
        (0, bun_test_1.expect)((_b = back.blocks.b1) === null || _b === void 0 ? void 0 : _b.type).toBe("textarea");
    });
    (0, bun_test_1.test)("migrateFromCallcasterFlow accepts blockType alias", function () {
        var _a;
        var flow = {
            pages: {
                p1: { id: "p1", title: "Intro", blocks: ["b1"] },
            },
            blocks: {
                b1: { blockType: "instruction", body: "Welcome" },
            },
        };
        var doc = scripts.migrateFromCallcasterFlow(flow);
        (0, bun_test_1.expect)((_a = doc.blocks.b1) === null || _a === void 0 ? void 0 : _a.type).toBe("instruction");
    });
    (0, bun_test_1.test)("migrateFromQuickCanvassBlocks serializes back", function () {
        var _a;
        (0, ids_js_1.resetIdCounter)();
        var blocks = [
            { id: "i1", type: "instruction", body: "Knock knock" },
            { id: "y1", type: "yes_no", prompt: "Home?" },
        ];
        var doc = scripts.migrateFromQuickCanvassBlocks(blocks);
        var linear = scripts.serializeToQuickCanvassBlocks(doc);
        (0, bun_test_1.expect)(linear).toHaveLength(2);
        (0, bun_test_1.expect)((_a = linear[0]) === null || _a === void 0 ? void 0 : _a.type).toBe("instruction");
    });
    (0, bun_test_1.test)("applyMergeTags replaces tokens", function () {
        var out = scripts.applyMergeTags("Hi {{first_name}}", { first_name: "Alex" });
        (0, bun_test_1.expect)(out).toBe("Hi Alex");
    });
    (0, bun_test_1.test)("evaluateRouting finds next unanswered block", function () {
        (0, ids_js_1.resetIdCounter)();
        var doc = scripts.createEmptyDocument();
        var page = doc.pages[doc.startPageId];
        var blockId = page === null || page === void 0 ? void 0 : page.blockIds[0];
        if (!blockId) {
            throw new Error("missing block");
        }
        doc.blocks[blockId] = {
            id: blockId,
            type: "yes_no",
            prompt: "Interested?",
            routingRules: [{ answerValue: "yes", targetPageId: doc.startPageId }],
        };
        var pending = scripts.evaluateRouting(doc, []);
        (0, bun_test_1.expect)(pending.complete).toBe(false);
        (0, bun_test_1.expect)(pending.nextBlockId).toBe(blockId);
        var done = scripts.evaluateRouting(doc, [{ blockId: blockId, value: "yes" }]);
        (0, bun_test_1.expect)(done.complete).toBe(true);
    });
});
