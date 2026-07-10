"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
exports.resetIdCounter = resetIdCounter;
var counter = 0;
function createId(prefix) {
    counter += 1;
    return "".concat(prefix, "_").concat(Date.now().toString(36), "_").concat(counter);
}
function resetIdCounter() {
    counter = 0;
}
