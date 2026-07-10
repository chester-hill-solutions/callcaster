"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocument = parseDocument;
exports.validateDocument = validateDocument;
exports.createEmptyDocument = createEmptyDocument;
exports.parseQuickCanvassBlocks = parseQuickCanvassBlocks;
var types_js_1 = require("./types.js");
var ids_js_1 = require("./ids.js");
function parseDocument(input, options) {
    var _a;
    if (options === void 0) { options = {}; }
    var mode = (_a = options.mode) !== null && _a !== void 0 ? _a : "strict";
    if (mode === "permissive" && input && typeof input === "object") {
        var candidate = input;
        if (!candidate.version) {
            return types_js_1.scriptDocumentSchema.parse(__assign(__assign({}, candidate), { version: 1 }));
        }
    }
    return types_js_1.scriptDocumentSchema.parse(input);
}
function validateDocument(doc) {
    var result = types_js_1.scriptDocumentSchema.safeParse(doc);
    if (!result.success) {
        return {
            ok: false,
            errors: result.error.issues.map(function (issue) { return "".concat(issue.path.join("."), ": ").concat(issue.message); }),
        };
    }
    var document = result.data;
    var errors = [];
    if (!document.pages[document.startPageId]) {
        errors.push("startPageId \"".concat(document.startPageId, "\" not found in pages"));
    }
    for (var _i = 0, _a = Object.values(document.pages); _i < _a.length; _i++) {
        var page = _a[_i];
        for (var _b = 0, _c = page.blockIds; _b < _c.length; _b++) {
            var blockId = _c[_b];
            if (!document.blocks[blockId]) {
                errors.push("page \"".concat(page.id, "\" references missing block \"").concat(blockId, "\""));
            }
        }
    }
    if (errors.length > 0) {
        return { ok: false, errors: errors };
    }
    return { ok: true, document: document };
}
function createEmptyDocument(options) {
    var _a, _b;
    var _c;
    if (options === void 0) { options = {}; }
    var pageId = (0, ids_js_1.createId)("page");
    var blockId = (0, ids_js_1.createId)("block");
    var title = (_c = options.title) !== null && _c !== void 0 ? _c : "Page 1";
    var instructionBlock = {
        id: blockId,
        type: "instruction",
        body: "Welcome script",
        prompt: "",
    };
    return {
        version: 1,
        startPageId: pageId,
        pages: (_a = {},
            _a[pageId] = {
                id: pageId,
                title: title,
                blockIds: [blockId],
            },
            _a),
        blocks: (_b = {},
            _b[blockId] = instructionBlock,
            _b),
    };
}
function parseQuickCanvassBlocks(input) {
    return types_js_1.quickCanvassBlockSchema.array().parse(input);
}
