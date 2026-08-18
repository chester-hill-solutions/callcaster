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

/**
 * Canonical "do not call" disposition. Always offered on the call screen and
 * matched server-side to set `contact.opt_out` and dequeue the contact from
 * every campaign.
 */
export const DNC_DISPOSITION = "do_not_call";

const DISPOSITION_LABELS: Record<string, string> = {
  answered: "Answered",
  no_answer: "No Answer",
  busy: "Busy",
  voicemail: "Voicemail",
  [DNC_DISPOSITION]: "Do Not Call",
};

/**
 * Canonical comparison key for disposition values: campaigns define options as
 * free strings, so "Do Not Call", "do-not-call", and "do_not_call" must all
 * count as the same disposition.
 */
function canonicalDisposition(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** True when a raw disposition value (or its display label) means "do not call". */
export function isDncDisposition(value: string | null | undefined): boolean {
  if (!value) return false;
  return canonicalDisposition(value) === DNC_DISPOSITION;
}

/** Display label for a disposition option (falls back to the raw string). */
export function formatDispositionLabel(option: string): string {
  return DISPOSITION_LABELS[canonicalDisposition(option)] ?? option;
}

/**
 * Sensible default disposition options for campaigns that do not have custom
 * options configured. Includes the most common call outcomes.
 */
export const DEFAULT_DISPOSITION_OPTIONS = [
  "answered",
  "no_answer",
  "busy",
  "voicemail",
] as const;

/**
 * `campaign.disposition_options` is a nullable jsonb column (`Json`), so it can be
 * null, a scalar, or an array of anything. Narrow it to the string list the call
 * screen expects instead of casting the `Json` away.
 *
 * When the campaign has not configured any disposition options (null/undefined/
 * non-array/empty), a sensible default set is returned instead of an empty list.
 *
 * Always appends {@link DNC_DISPOSITION} (deduped case/format-insensitively) so
 * every campaign offers a "do not call" option regardless of its configuration.
 */
export function normalizeDispositionOptions(value: unknown): string[] {
  const options = Array.isArray(value) && value.length > 0
    ? value.filter((option): option is string => typeof option === "string")
    : [...DEFAULT_DISPOSITION_OPTIONS];
  if (options.length > 0 && !options.some((option) => isDncDisposition(option))) {
    options.push(DNC_DISPOSITION);
  }
  return options;
}

export function shouldUpdateOutreachDisposition(args: {
  currentDisposition: string | null | undefined;
  nextDisposition: string | null | undefined;
}): boolean {
  const next = String(args.nextDisposition ?? "").toLowerCase();
  if (!next) return false;
  return canTransitionOutreachDisposition(args.currentDisposition ?? null, next);
}

