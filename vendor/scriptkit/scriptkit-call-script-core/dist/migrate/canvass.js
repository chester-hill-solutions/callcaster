"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateFromQuickCanvassBlocks = migrateFromQuickCanvassBlocks;
exports.serializeToQuickCanvassBlocks = serializeToQuickCanvassBlocks;
var types_js_1 = require("../types.js");
var ids_js_1 = require("../ids.js");
var CANVASS_TYPES = new Set(["instruction", "yes_no", "choice", "text", "support"]);
function migrateFromQuickCanvassBlocks(blocksInput) {
    var _a;
    var _b, _c, _d, _e, _f, _g, _h;
    var linear = types_js_1.quickCanvassBlockSchema.array().parse(blocksInput);
    var pageId = (0, ids_js_1.createId)("page");
    var blockIds = [];
    var blocks = {};
    for (var _i = 0, linear_1 = linear; _i < linear_1.length; _i++) {
        var item = linear_1[_i];
        var id = item.id || (0, ids_js_1.createId)("block");
        blockIds.push(id);
        if (item.type === "instruction") {
            blocks[id] = {
                id: id,
                type: "instruction",
                body: (_c = (_b = item.body) !== null && _b !== void 0 ? _b : item.prompt) !== null && _c !== void 0 ? _c : "",
                prompt: item.prompt,
                required: item.required,
            };
            continue;
        }
        if (item.type === "yes_no") {
            blocks[id] = {
                id: id,
                type: "yes_no",
                prompt: (_d = item.prompt) !== null && _d !== void 0 ? _d : "",
                required: item.required,
            };
            continue;
        }
        if (item.type === "choice") {
            blocks[id] = {
                id: id,
                type: "choice",
                prompt: (_e = item.prompt) !== null && _e !== void 0 ? _e : "",
                options: (_f = item.options) !== null && _f !== void 0 ? _f : [],
                required: item.required,
            };
            continue;
        }
        if (item.type === "text") {
            blocks[id] = {
                id: id,
                type: "text",
                prompt: (_g = item.prompt) !== null && _g !== void 0 ? _g : "",
                placeholder: item.placeholder,
                required: item.required,
            };
            continue;
        }
        blocks[id] = {
            id: id,
            type: "support",
            prompt: (_h = item.prompt) !== null && _h !== void 0 ? _h : "",
            required: item.required,
        };
    }
    return {
        version: 1,
        startPageId: pageId,
        pages: (_a = {},
            _a[pageId] = {
                id: pageId,
                title: "Canvass script",
                blockIds: blockIds,
            },
            _a),
        blocks: blocks,
    };
}
function serializeToQuickCanvassBlocks(doc) {
    var startPage = doc.pages[doc.startPageId];
    if (!startPage) {
        return [];
    }
    var output = [];
    for (var _i = 0, _a = startPage.blockIds; _i < _a.length; _i++) {
        var blockId = _a[_i];
        var block = doc.blocks[blockId];
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
            default: {
                var _exhaustive = block.type;
                throw new Error("Unsupported canvass block type: ".concat(String(_exhaustive)));
            }
        }
    }
    return output;
}
