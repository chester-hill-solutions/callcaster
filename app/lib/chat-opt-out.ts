// Twilio long-code defaults plus the requested "OPT OUT" alias: https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out
const DEFAULT_OPT_OUT_KEYWORDS = [
  "STOP",
  "UNSUBSCRIBE",
  "END",
  "QUIT",
  "STOPALL",
  "REVOKE",
  "OPTOUT",
  "CANCEL",
  "OPT OUT",
];

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function mergeOptOutKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_OPT_OUT_KEYWORDS,
      ...keywords.map(normalizeKeyword).filter(Boolean),
    ]),
  );
}

export function parseOptOutKeywords(
  value: string | null | undefined,
): string[] {
  return mergeOptOutKeywords((value ?? "").split(/[,\n]/));
}

export function isOptOutMessage(
  body: string | null | undefined,
  keywords: string[],
): boolean {
  const normalizedBody = normalizeKeyword(body ?? "");
  return (
    normalizedBody !== "" &&
    mergeOptOutKeywords(keywords).includes(normalizedBody)
  );
}
