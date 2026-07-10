"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateRouting = evaluateRouting;
function evaluateRouting(doc, answers, startPageId) {
    var _a;
    if (startPageId === void 0) { startPageId = doc.startPageId; }
    var answerMap = new Map(answers.map(function (a) { return [a.blockId, a.value]; }));
    var pageId = startPageId;
    var visited = new Set();
    while (pageId && !visited.has(pageId)) {
        visited.add(pageId);
        var page = doc.pages[pageId];
        if (!page) {
            return { nextPageId: null, nextBlockId: null, complete: true };
        }
        var _loop_1 = function (blockId) {
            var block = doc.blocks[blockId];
            if (!block) {
                return "continue";
            }
            if (block.type === "instruction") {
                return "continue";
            }
            var value = answerMap.get(blockId);
            if (value === undefined) {
                return { value: { nextPageId: pageId, nextBlockId: blockId, complete: false } };
            }
            var rule = (_a = block.routingRules) === null || _a === void 0 ? void 0 : _a.find(function (r) { return r.answerValue === value; });
            if (rule === null || rule === void 0 ? void 0 : rule.targetPageId) {
                pageId = rule.targetPageId;
                return "break";
            }
            if (rule === null || rule === void 0 ? void 0 : rule.targetBlockId) {
                return { value: { nextPageId: pageId, nextBlockId: rule.targetBlockId, complete: false } };
            }
        };
        for (var _i = 0, _b = page.blockIds; _i < _b.length; _i++) {
            var blockId = _b[_i];
            var state_1 = _loop_1(blockId);
            if (typeof state_1 === "object")
                return state_1.value;
            if (state_1 === "break")
                break;
        }
        if (!page.blockIds.some(function (id) { return answerMap.get(id) === undefined; })) {
            return { nextPageId: null, nextBlockId: null, complete: true };
        }
    }
    return { nextPageId: null, nextBlockId: null, complete: true };
}
