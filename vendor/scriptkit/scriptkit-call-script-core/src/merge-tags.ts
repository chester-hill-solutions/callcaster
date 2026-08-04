import type { MergeTagContext } from "./types.js";

const MERGE_TAG_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function applyMergeTags(text: string, context: MergeTagContext): string {
  return text.replace(MERGE_TAG_PATTERN, (_match, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}
