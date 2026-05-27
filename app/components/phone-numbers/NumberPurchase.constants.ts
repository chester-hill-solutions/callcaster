import type { NumberSearchMode } from "@/lib/numbers-search.server";

export type {
  AvailableNumber,
  NumbersSearchFetcherData,
  PurchaseFetcherData,
} from "@/lib/numbers-search.types";

export const SEARCH_MODE_LABELS: Record<NumberSearchMode, string> = {
  areaCode: "Area code",
  province: "Province",
  city: "City",
  postalCode: "Postal code",
  contains: "Number pattern",
};

export const SEARCH_PLACEHOLDERS: Record<NumberSearchMode, string> = {
  areaCode: "e.g. 416",
  province: "e.g. ON",
  city: "e.g. Toronto",
  postalCode: "e.g. M5H or M5H 2N2",
  contains: "e.g. +416555",
};

export const SEARCH_DESCRIPTIONS: Record<NumberSearchMode, string> = {
  areaCode: "3-digit Canadian area code (NPA).",
  province: "2-letter province or territory code.",
  city: "City or locality name in Canada.",
  postalCode: "Canadian postal code (FSA or full).",
  contains:
    "Match digits in the number (2–16 characters; Twilio pattern rules apply).",
};

export function emptyMessageForMode(mode: NumberSearchMode, query: string): string {
  switch (mode) {
    case "areaCode":
      return `No numbers found for area code ${query}.`;
    case "province":
      return `No numbers found in ${query.toUpperCase()}.`;
    case "city":
      return `No numbers found near ${query}.`;
    case "postalCode":
      return `No numbers found for postal code ${query}.`;
    case "contains":
      return `No numbers matched pattern "${query}".`;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
