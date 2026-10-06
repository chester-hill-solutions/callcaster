/** Exact provider values; descriptions cannot establish an opt-in type. */
export const TOLL_FREE_OPT_IN_TYPES = [
  "VERBAL", "WEB_FORM", "PAPER_FORM", "VIA_TEXT", "MOBILE_QR_CODE",
  "IMPORT", "IMPORT_PLEASE_REPLACE",
] as const;

export type TollFreeOptInType = (typeof TOLL_FREE_OPT_IN_TYPES)[number];

export function parseTollFreeOptInType(value: unknown): TollFreeOptInType | null {
  return TOLL_FREE_OPT_IN_TYPES.find((type) => type === value) ?? null;
}
