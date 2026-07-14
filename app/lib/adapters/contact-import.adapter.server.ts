/**
 * Thin adapter for `@chester-hill-solutions/contact-import` (not yet published).
 *
 * Wraps audience-upload entry points under package-shaped names so call sites
 * can swap to the CHS package by changing imports here only.
 *
 * @see docs/chs-package-adoption.md
 */
export {
  processAudienceUpload as processContactImport,
  markAudienceUploadInterruptedIfStale as markImportInterruptedIfStale,
  normalizeVoterListSource,
  isOtherDataArray,
  generateUniqueId,
  VOTER_LIST_SOURCE_ALIASES,
  type VoterListSource,
} from "@/lib/audience-upload-process.server";
