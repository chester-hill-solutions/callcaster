/** Provider counts are whole, non-negative integers; zero can be provisional. */
export function parseSmsProviderCount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : null;
}

export function smsProviderQuantityFields(values: {
  numSegments?: unknown;
  numMedia?: unknown;
}): { num_segments?: string; num_media?: string } {
  const segments = parseSmsProviderCount(values.numSegments);
  const media = parseSmsProviderCount(values.numMedia);
  return {
    ...(segments != null ? { num_segments: String(segments) } : {}),
    ...(media != null ? { num_media: String(media) } : {}),
  };
}
