import { type CallcasterFlow, type QuickCanvassBlock, type ScriptDocument } from "./types.js";
export declare function migrateFromCallcasterFlow(flow: unknown): ScriptDocument;
export declare function serializeToCallcasterFlow(doc: ScriptDocument): CallcasterFlow;
export declare function migrateFromQuickCanvassBlocks(blocksInput: unknown): ScriptDocument;
export declare function serializeToQuickCanvassBlocks(doc: ScriptDocument): QuickCanvassBlock[];
