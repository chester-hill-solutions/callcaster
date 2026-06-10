export const INBOUND_RING_COUNT_MIN = 1;
export const INBOUND_RING_COUNT_MAX = 10;
export const INBOUND_RING_COUNT_DEFAULT = 4;
export const SECONDS_PER_INBOUND_RING = 5;

export const INBOUND_RING_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

export function normalizeInboundRingCount(value: unknown | null): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return INBOUND_RING_COUNT_DEFAULT;
  }

  return Math.min(
    INBOUND_RING_COUNT_MAX,
    Math.max(INBOUND_RING_COUNT_MIN, Math.round(parsed)),
  );
}

export function inboundRingCountToDialTimeoutSeconds(ringCount: unknown | null): number {
  return normalizeInboundRingCount(ringCount) * SECONDS_PER_INBOUND_RING;
}
