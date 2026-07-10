"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bun_test_1 = require("bun:test");
var callcaster_js_1 = require("./callcaster.js");
// Mirrors the shape documented in docs/script-json-format.md and
// docs/example-script.json in the consuming app: options are keyed by
// { content, next } (not { value, label }), and every block carries an
// audioFile reference (possibly empty).
var callcasterFlow = {
    pages: {
        page_1: {
            id: "page_1",
            title: "Introduction",
            blocks: ["block_1", "block_2"],
        },
        page_2: {
            id: "page_2",
            title: "Main Questions",
            blocks: ["block_3", "block_4", "block_5"],
        },
        page_3: {
            id: "page_3",
            title: "Closing",
            blocks: ["block_6"],
        },
    },
    blocks: {
        block_1: {
            id: "block_1",
            type: "textarea",
            title: "Greeting",
            content: "Hello, my name is [Agent Name].",
            options: [],
            audioFile: "",
        },
        block_2: {
            id: "block_2",
            type: "select",
            title: "Initial Response",
            content: "Do you have a few minutes to talk?",
            options: [
                { content: "Yes", next: "block_3" },
                { content: "No", next: "block_6" },
                { content: "Call back later", next: "block_6" },
            ],
            audioFile: "greeting.mp3",
        },
        block_3: {
            id: "block_3",
            type: "textarea",
            title: "Service Introduction",
            content: "Great! Let me tell you more.",
            options: [],
            audioFile: "",
        },
        block_4: {
            id: "block_4",
            type: "radio",
            title: "Interest Level",
            content: "On a scale of 1-3, how interested are you?",
            options: [
                { content: "1 - Not interested", next: "block_6" },
                { content: "2 - Somewhat interested", next: "block_5" },
                { content: "3 - Very interested", next: "block_5" },
            ],
            audioFile: "interest.mp3",
        },
        block_5: {
            id: "block_5",
            type: "checkbox",
            title: "Follow-up Preferences",
            content: "What would be the best way to follow up?",
            options: [
                { content: "Email information", next: "block_6" },
                { content: "Schedule a demo", next: "block_6" },
                { content: "Call back next week", next: "block_6" },
            ],
            audioFile: "",
        },
        block_6: {
            id: "block_6",
            type: "textarea",
            title: "Closing",
            content: "Thank you for your time today.",
            options: [],
            audioFile: "closing.mp3",
        },
    },
};
(0, bun_test_1.describe)("callcaster migrate/serialize round-trip", function () {
    (0, bun_test_1.test)("every option.next survives migrate -> serialize", function () {
        var _a, _b, _c;
        var doc = (0, callcaster_js_1.migrateFromCallcasterFlow)(callcasterFlow);
        var back = (0, callcaster_js_1.serializeToCallcasterFlow)(doc);
        var _loop_1 = function (blockId, rawBlock) {
            var originalOptions = (_a = rawBlock.options) !== null && _a !== void 0 ? _a : [];
            var roundTrippedOptions = (_c = (_b = back.blocks[blockId]) === null || _b === void 0 ? void 0 : _b.options) !== null && _c !== void 0 ? _c : [];
            (0, bun_test_1.expect)(roundTrippedOptions).toHaveLength(originalOptions.length);
            originalOptions.forEach(function (original, index) {
                var _a, _b;
                (0, bun_test_1.expect)((_a = roundTrippedOptions[index]) === null || _a === void 0 ? void 0 : _a.next).toBe(original.next);
                (0, bun_test_1.expect)((_b = roundTrippedOptions[index]) === null || _b === void 0 ? void 0 : _b.content).toBe(original.content);
            });
        };
        for (var _i = 0, _d = Object.entries(callcasterFlow.blocks); _i < _d.length; _i++) {
            var _e = _d[_i], blockId = _e[0], rawBlock = _e[1];
            _loop_1(blockId, rawBlock);
        }
    });
    (0, bun_test_1.test)("every block.audioFile survives migrate -> serialize", function () {
        var _a;
        var doc = (0, callcaster_js_1.migrateFromCallcasterFlow)(callcasterFlow);
        var back = (0, callcaster_js_1.serializeToCallcasterFlow)(doc);
        for (var _i = 0, _b = Object.entries(callcasterFlow.blocks); _i < _b.length; _i++) {
            var _c = _b[_i], blockId = _c[0], rawBlock = _c[1];
            (0, bun_test_1.expect)((_a = back.blocks[blockId]) === null || _a === void 0 ? void 0 : _a.audioFile).toBe(rawBlock.audioFile);
        }
    });
    (0, bun_test_1.test)("option value/label are populated from wire content (not left empty)", function () {
        var _a, _b, _c;
        var doc = (0, callcaster_js_1.migrateFromCallcasterFlow)(callcasterFlow);
        var block2 = doc.blocks.block_2;
        (0, bun_test_1.expect)(block2 === null || block2 === void 0 ? void 0 : block2.type).toBe("select");
        if ((block2 === null || block2 === void 0 ? void 0 : block2.type) === "select") {
            (0, bun_test_1.expect)((_a = block2.options[0]) === null || _a === void 0 ? void 0 : _a.value).toBe("Yes");
            (0, bun_test_1.expect)((_b = block2.options[0]) === null || _b === void 0 ? void 0 : _b.label).toBe("Yes");
            (0, bun_test_1.expect)((_c = block2.options[0]) === null || _c === void 0 ? void 0 : _c.next).toBe("block_3");
        }
    });
});
