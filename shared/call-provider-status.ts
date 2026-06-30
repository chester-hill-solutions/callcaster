import { TERMINAL_BILLABLE_CALL_STATUSES } from "./pricing.ts";

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
  const lower =
    raw === "in_progress"
      ? "in-progress"
      : raw === "no_answer"
        ? "no-answer"
        : raw;
  if (VALID_CALL_STATUSES.includes(lower as CallStatusEnum)) {
    return lower as CallStatusEnum;
  }
  return null;
}

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

export const CALL_STATUSES_BILLABLE_ON_COMPLETION = new Set<string>(
  TERMINAL_BILLABLE_CALL_STATUSES,
);
