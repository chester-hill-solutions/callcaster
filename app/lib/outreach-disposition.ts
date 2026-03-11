export const TERMINAL_OUTREACH_DISPOSITIONS_LIST = [
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
  "cancelled",
  "voicemail",
  "voicemail-no-message",
  "delivered",
  "undelivered",
] as const;

export const TERMINAL_OUTREACH_DISPOSITIONS = new Set<string>(
  TERMINAL_OUTREACH_DISPOSITIONS_LIST,
);

export function canTransitionOutreachDisposition(
  current: string | null | undefined,
  next: string,
): boolean {
  if (!current) return true;
  const c = String(current).toLowerCase();
  const n = String(next).toLowerCase();
  return !(TERMINAL_OUTREACH_DISPOSITIONS.has(c) && c !== n);
}

export function shouldUpdateOutreachDisposition(args: {
  currentDisposition: string | null | undefined;
  nextDisposition: string | null | undefined;
}): boolean {
  const next = String(args.nextDisposition ?? "").toLowerCase();
  if (!next) return false;
  return canTransitionOutreachDisposition(args.currentDisposition ?? null, next);
}

