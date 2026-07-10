"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCallScriptService = createCallScriptService;
var merge_tags_js_1 = require("./merge-tags.js");
var index_js_1 = require("./migrate/index.js");
var parse_js_1 = require("./parse.js");
var routing_js_1 = require("./routing.js");
function createCallScriptService(_config) {
    if (_config === void 0) { _config = {}; }
    return {
        parseDocument: parse_js_1.parseDocument,
        validateDocument: parse_js_1.validateDocument,
        migrateFromCallcasterFlow: index_js_1.migrateFromCallcasterFlow,
        serializeToCallcasterFlow: index_js_1.serializeToCallcasterFlow,
        migrateFromQuickCanvassBlocks: index_js_1.migrateFromQuickCanvassBlocks,
        serializeToQuickCanvassBlocks: index_js_1.serializeToQuickCanvassBlocks,
        evaluateRouting: routing_js_1.evaluateRouting,
        applyMergeTags: merge_tags_js_1.applyMergeTags,
        createEmptyDocument: parse_js_1.createEmptyDocument,
    };
}
