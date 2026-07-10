"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyMergeTags = applyMergeTags;
var MERGE_TAG_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
function applyMergeTags(text, context) {
    return text.replace(MERGE_TAG_PATTERN, function (_match, key) {
        var value = context[key];
        if (value === null || value === undefined) {
            return "";
        }
        return String(value);
    });
}
