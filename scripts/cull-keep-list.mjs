/**
 * Workspace IDs that must survive the dev cull report.
 *
 * Confirmed after the 2026-10-02 cull in issue #2168. The numeric workspace
 * name `2608141501` is intentionally kept, even though it matches the
 * phone-number-name rule.
 */
export const DEV_CULL_KEEP_WORKSPACE_IDS = Object.freeze([
  "701582c0-4af4-451f-a53b-454de7738bbb", // Keep despite matching the phone-name rule.
  "a87c081c-23c4-4046-823d-466f6d087e4e", // 2026 Municipal Ward 19 NES Campaign
  "5dc1da78-9ac3-4f26-807a-077898a7cf72", // HESC Phone Bank
]);
