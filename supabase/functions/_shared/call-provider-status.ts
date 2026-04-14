/**
 * Twilio voice call status normalization for Edge (parity with app/lib/call-status.ts).
 */

export type CallStatusEnum =
  | "queued"
  | "ringing"
  | "in-progress"
  | "canceled"
  | "completed"
  | "failed"
  | "busy"
  | "no-answer"
  | "initiated";

const VALID_CALL_STATUSES: CallStatusEnum[] = [
  "queued",
  "ringing",
  "in-progress",
  "canceled",
  "completed",
  "failed",
  "busy",
  "no-answer",
  "initiated",
];

export function normalizeProviderStatus(
  providerStatus: string | null | undefined,
): CallStatusEnum | null {
  if (providerStatus == null || providerStatus === "") return null;
  const raw = String(providerStatus).trim().toLowerCase();
  /** Rare SDK / proxy variants; DB enum is always hyphenated. */
  const lower = raw === "in_progress"
    ? "in-progress"
    : raw === "no_answer"
    ? "no-answer"
    : raw;
  if (VALID_CALL_STATUSES.includes(lower as CallStatusEnum)) {
    return lower as CallStatusEnum;
  }
  return null;
}

/** Statuses that mean the call is still live or dialing; worth reconciling with Twilio. */
const ACTIVE_STATUSES = new Set<CallStatusEnum>([
  "initiated",
  "queued",
  "ringing",
  "in-progress",
]);

export function isActiveCallStatusForSync(
  status: string | null | undefined,
): boolean {
  const n = normalizeProviderStatus(status);
  return n != null && ACTIVE_STATUSES.has(n);
}

/** Terminal outcomes that trigger per-minute debit in api.call-status / ivr-style billing. */
export const CALL_STATUSES_BILLABLE_ON_COMPLETION = new Set<string>([
  "completed",
  "failed",
  "no-answer",
  "busy",
]);
