const DEFAULT_OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE"];

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function parseOptOutKeywords(value: string | null | undefined): string[] {
  const parsedKeywords = (value ?? "")
    .split(/[,\n]/)
    .map((keyword) => normalizeKeyword(keyword))
    .filter(Boolean);

  if (parsedKeywords.length === 0) {
    return DEFAULT_OPT_OUT_KEYWORDS;
  }

  return Array.from(new Set(parsedKeywords));
}

export function isOptOutMessage(
  body: string | null | undefined,
  keywords: string[],
): boolean {
  const normalizedBody = normalizeKeyword(body ?? "");

  if (!normalizedBody) {
    return false;
  }

  const normalizedKeywords =
    keywords.length > 0 ? keywords.map((keyword) => normalizeKeyword(keyword)) : DEFAULT_OPT_OUT_KEYWORDS;

  return normalizedKeywords.includes(normalizedBody);
}
