import { type QuickCanvassBlock, type ScriptDocument } from "../types.js";
export declare function migrateFromQuickCanvassBlocks(blocksInput: unknown): ScriptDocument;
export declare function serializeToQuickCanvassBlocks(doc: ScriptDocument): QuickCanvassBlock[];
