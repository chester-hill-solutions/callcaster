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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callcasterWireBlockSchema = void 0;
exports.migrateFromCallcasterFlow = migrateFromCallcasterFlow;
exports.serializeToCallcasterFlow = serializeToCallcasterFlow;
var zod_1 = require("zod");
var types_js_1 = require("../types.js");
var ids_js_1 = require("../ids.js");
var CALLCASTER_TYPE_MAP = {
    textarea: "textarea",
    select: "select",
    radio: "radio",
    checkbox: "checkbox",
    text: "textarea",
    instruction: "instruction",
};
exports.callcasterWireBlockSchema = zod_1.z
    .object({
    id: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    blockType: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    label: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    body: zod_1.z.string().optional(),
    content: zod_1.z.string().optional(),
    required: zod_1.z.boolean().optional(),
    options: zod_1.z.array(zod_1.z.unknown()).optional(),
    routingRules: zod_1.z.array(zod_1.z.unknown()).optional(),
    /** Recorded-audio reference. Must survive a migrate -> serialize round-trip. */
    audioFile: zod_1.z.string().optional(),
})
    .passthrough();
function resolveCallcasterBlockType(raw) {
    var _a, _b, _c;
    var typeRaw = String((_b = (_a = raw.type) !== null && _a !== void 0 ? _a : raw.blockType) !== null && _b !== void 0 ? _b : "textarea");
    return (_c = CALLCASTER_TYPE_MAP[typeRaw]) !== null && _c !== void 0 ? _c : "textarea";
}
function normalizeCallcasterBlock(id, raw) {
    var _a, _b, _c, _d, _e;
    var parsed = exports.callcasterWireBlockSchema.parse(raw);
    var mapped = resolveCallcasterBlockType(parsed);
    var prompt = String((_c = (_b = (_a = parsed.prompt) !== null && _a !== void 0 ? _a : parsed.label) !== null && _b !== void 0 ? _b : parsed.title) !== null && _c !== void 0 ? _c : "");
    var options = Array.isArray(parsed.options)
        ? parsed.options.map(function (opt) {
            var _a, _b, _c, _d, _e, _f;
            if (typeof opt === "string") {
                return { value: opt, label: opt };
            }
            var record = opt;
            // The Callcaster wire format keys options by { content, next } rather
            // than { value, label } (see docs/script-json-format.md). Derive
            // value/label sensibly from whatever is present, and carry `next`
            // and `content` through verbatim so nothing is lost on round-trip.
            var value = String((_d = (_c = (_b = (_a = record.value) !== null && _a !== void 0 ? _a : record.id) !== null && _b !== void 0 ? _b : record.content) !== null && _c !== void 0 ? _c : record.label) !== null && _d !== void 0 ? _d : "");
            var label = String((_f = (_e = record.label) !== null && _e !== void 0 ? _e : record.content) !== null && _f !== void 0 ? _f : value);
            var next = typeof record.next === "string" ? record.next : undefined;
            var content = typeof record.content === "string" ? record.content : undefined;
            return __assign(__assign({ value: value, label: label }, (next !== undefined ? { next: next } : {})), (content !== undefined ? { content: content } : {}));
        })
        : [];
    var base = {
        id: id,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        prompt: prompt,
        required: Boolean(parsed.required),
        audioFile: typeof parsed.audioFile === "string" ? parsed.audioFile : undefined,
        routingRules: Array.isArray(parsed.routingRules)
            ? parsed.routingRules.map(function (rule) {
                var _a, _b;
                var r = rule;
                return {
                    answerValue: String((_b = (_a = r.answerValue) !== null && _a !== void 0 ? _a : r.value) !== null && _b !== void 0 ? _b : ""),
                    targetPageId: r.targetPageId ? String(r.targetPageId) : undefined,
                    targetBlockId: r.targetBlockId ? String(r.targetBlockId) : undefined,
                };
            })
            : undefined,
    };
    switch (mapped) {
        case "instruction":
            return __assign(__assign({}, base), { type: "instruction", body: String((_e = (_d = parsed.body) !== null && _d !== void 0 ? _d : parsed.content) !== null && _e !== void 0 ? _e : prompt) });
        case "select":
            return __assign(__assign({}, base), { type: "select", options: options, prompt: prompt });
        case "radio":
            return __assign(__assign({}, base), { type: "radio", options: options, prompt: prompt });
        case "checkbox":
            return __assign(__assign({}, base), { type: "checkbox", options: options, prompt: prompt });
        case "textarea":
        default:
            return __assign(__assign({}, base), { type: "textarea", prompt: prompt });
    }
}
function migrateFromCallcasterFlow(flow) {
    var _a, _b, _c, _d;
    var parsed = types_js_1.callcasterFlowSchema.parse(flow);
    var pages = {};
    var blocks = {};
    for (var _i = 0, _e = Object.entries(parsed.pages); _i < _e.length; _i++) {
        var _f = _e[_i], pageId = _f[0], page = _f[1];
        var id = (_a = page.id) !== null && _a !== void 0 ? _a : pageId;
        pages[id] = {
            id: id,
            title: (_b = page.title) !== null && _b !== void 0 ? _b : "Page",
            blockIds: __spreadArray([], ((_c = page.blocks) !== null && _c !== void 0 ? _c : []), true),
        };
    }
    for (var _g = 0, _h = Object.entries(parsed.blocks); _g < _h.length; _g++) {
        var _j = _h[_g], blockId = _j[0], rawBlock = _j[1];
        blocks[blockId] = normalizeCallcasterBlock(blockId, rawBlock);
    }
    var startPageId = (_d = Object.keys(pages)[0]) !== null && _d !== void 0 ? _d : (0, ids_js_1.createId)("page");
    if (!pages[startPageId]) {
        pages[startPageId] = { id: startPageId, title: "Page 1", blockIds: [] };
    }
    return { version: 1, startPageId: startPageId, pages: pages, blocks: blocks };
}
function serializeToCallcasterFlow(doc) {
    var pages = {};
    var blocks = {};
    for (var _i = 0, _a = Object.values(doc.pages); _i < _a.length; _i++) {
        var page = _a[_i];
        pages[page.id] = {
            id: page.id,
            title: page.title,
            blocks: __spreadArray([], page.blockIds, true),
        };
    }
    for (var _b = 0, _c = Object.values(doc.blocks); _b < _c.length; _b++) {
        var block = _c[_b];
        var wire = {
            id: block.id,
            type: block.type === "instruction" ? "instruction" : block.type,
            prompt: "prompt" in block ? block.prompt : undefined,
            label: block.label,
            required: block.required,
            routingRules: block.routingRules,
            audioFile: block.audioFile,
        };
        if (block.type === "instruction") {
            wire.body = block.body;
        }
        if ("options" in block && block.options) {
            // Emit both the internal { value, label } shape and the Callcaster
            // wire's { content, next } shape so a migrate -> serialize round-trip
            // doesn't drop routing (`next`) or the original option text.
            wire.options = block.options.map(function (option) {
                var _a, _b;
                return ({
                    value: option.value,
                    label: option.label,
                    content: (_b = (_a = option.content) !== null && _a !== void 0 ? _a : option.label) !== null && _b !== void 0 ? _b : option.value,
                    next: option.next,
                });
            });
        }
        blocks[block.id] = wire;
    }
    return { pages: pages, blocks: blocks };
}
