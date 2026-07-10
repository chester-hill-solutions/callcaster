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
exports.CALLCASTER_BLOCK_TYPES = exports.CANVASS_BLOCK_TYPES = exports.quickCanvassBlockSchema = exports.callcasterFlowSchema = exports.scriptDocumentSchema = exports.scriptPageSchema = exports.scriptBlockSchema = exports.checkboxBlockSchema = exports.radioBlockSchema = exports.selectBlockSchema = exports.textareaBlockSchema = exports.supportBlockSchema = exports.textBlockSchema = exports.choiceBlockSchema = exports.yesNoBlockSchema = exports.instructionBlockSchema = exports.routingRuleSchema = exports.scriptPaletteSchema = void 0;
var zod_1 = require("zod");
exports.scriptPaletteSchema = zod_1.z.enum(["callcaster", "canvass"]);
exports.routingRuleSchema = zod_1.z.object({
    answerValue: zod_1.z.string(),
    targetPageId: zod_1.z.string().optional(),
    targetBlockId: zod_1.z.string().optional(),
});
var baseBlockFields = {
    id: zod_1.z.string().min(1),
    label: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    required: zod_1.z.boolean().optional(),
    routingRules: zod_1.z.array(exports.routingRuleSchema).optional(),
    /** Recorded-audio reference carried through from/to the Callcaster wire format. */
    audioFile: zod_1.z.string().optional(),
};
/**
 * Option shape shared by choice/select/radio/checkbox blocks. `value`/`label`
 * are the canonical internal representation; `next` and `content` are
 * carried through losslessly from the Callcaster wire format (which keys
 * options by `{ content, next }` rather than `{ value, label }`) so a
 * migrate -> serialize round-trip doesn't drop routing or original text.
 */
var scriptOptionSchema = zod_1.z.object({
    value: zod_1.z.string(),
    label: zod_1.z.string(),
    next: zod_1.z.string().optional(),
    content: zod_1.z.string().optional(),
});
exports.instructionBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("instruction"), body: zod_1.z.string().default("") }));
exports.yesNoBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("yes_no"), prompt: zod_1.z.string().default("") }));
exports.choiceBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("choice"), prompt: zod_1.z.string().default(""), options: zod_1.z.array(scriptOptionSchema).default([]) }));
exports.textBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("text"), prompt: zod_1.z.string().default(""), placeholder: zod_1.z.string().optional() }));
exports.supportBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("support"), prompt: zod_1.z.string().default("") }));
exports.textareaBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("textarea"), prompt: zod_1.z.string().default("") }));
exports.selectBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("select"), prompt: zod_1.z.string().default(""), options: zod_1.z.array(scriptOptionSchema).default([]) }));
exports.radioBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("radio"), prompt: zod_1.z.string().default(""), options: zod_1.z.array(scriptOptionSchema).default([]) }));
exports.checkboxBlockSchema = zod_1.z.object(__assign(__assign({}, baseBlockFields), { type: zod_1.z.literal("checkbox"), prompt: zod_1.z.string().default(""), options: zod_1.z.array(scriptOptionSchema).default([]) }));
exports.scriptBlockSchema = zod_1.z.discriminatedUnion("type", [
    exports.instructionBlockSchema,
    exports.yesNoBlockSchema,
    exports.choiceBlockSchema,
    exports.textBlockSchema,
    exports.supportBlockSchema,
    exports.textareaBlockSchema,
    exports.selectBlockSchema,
    exports.radioBlockSchema,
    exports.checkboxBlockSchema,
]);
exports.scriptPageSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    title: zod_1.z.string().default("Page"),
    blockIds: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.scriptDocumentSchema = zod_1.z.object({
    version: zod_1.z.literal(1),
    startPageId: zod_1.z.string().min(1),
    pages: zod_1.z.record(zod_1.z.string(), exports.scriptPageSchema),
    blocks: zod_1.z.record(zod_1.z.string(), exports.scriptBlockSchema),
});
exports.callcasterFlowSchema = zod_1.z.object({
    pages: zod_1.z.record(zod_1.z.string(), zod_1.z.object({
        id: zod_1.z.string().optional(),
        title: zod_1.z.string().optional(),
        blocks: zod_1.z.array(zod_1.z.string()).optional(),
    })),
    blocks: zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())),
});
exports.quickCanvassBlockSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum(["instruction", "yes_no", "choice", "text", "support"]),
    prompt: zod_1.z.string().optional(),
    body: zod_1.z.string().optional(),
    options: zod_1.z
        .array(zod_1.z.object({ value: zod_1.z.string(), label: zod_1.z.string() }))
        .optional(),
    placeholder: zod_1.z.string().optional(),
    required: zod_1.z.boolean().optional(),
});
exports.CANVASS_BLOCK_TYPES = [
    "instruction",
    "yes_no",
    "choice",
    "text",
    "support",
];
exports.CALLCASTER_BLOCK_TYPES = [
    "instruction",
    "textarea",
    "select",
    "radio",
    "checkbox",
];
