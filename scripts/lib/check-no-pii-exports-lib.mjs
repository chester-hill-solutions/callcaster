/**
 * Purity for the PII export gate. See scripts/check-no-pii-exports.mjs for the
 * CLI that uses it, and test/check-no-pii-exports.test.ts for the tests.
 */

/** File extensions that carry campaign export data. */
export const BLOCKED_EXTENSIONS = [".csv", ".pdf"];

/**
 * Tracked files that live in the repository root and carry a blocked
 * extension. Root-anchored on purpose: nested fixture directories are fine.
 *
 * @param {string[]} trackedPaths
 * @param {string[]} [extensions]
 * @returns {string[]}
 */
export function rootExportFiles(trackedPaths, extensions = BLOCKED_EXTENSIONS) {
  return trackedPaths.filter((path) => {
    if (path.includes("/")) return false;
    const lower = path.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
  });
}
