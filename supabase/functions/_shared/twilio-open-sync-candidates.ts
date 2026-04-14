/**
 * Selection rules for periodic Twilio REST reconciliation (messages + calls).
 */

import type { TwilioSmsStatus } from "./sms-status-logic.ts";

/** Outbound-ish directions we reconcile against Twilio SMS API. */
export function isOutboundMessageDirectionForSync(
  direction: string | null | undefined,
): boolean {
  if (direction == null || direction === "") return false;
  return direction !== "inbound";
}

/**
 * Message rows that may still change on Twilio (exclude terminal + read + canceled).
 */
export const OPEN_MESSAGE_STATUS_LIST: TwilioSmsStatus[] = [
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "receiving",
  "received",
];

const OPEN_MESSAGE_STATUSES = new Set<TwilioSmsStatus>(OPEN_MESSAGE_STATUS_LIST);

export function isOpenMessageStatusForSync(
  status: string | null | undefined,
): boolean {
  if (status == null || status === "") return false;
  return OPEN_MESSAGE_STATUSES.has(status as TwilioSmsStatus);
}

export function parseTwilioOpenSyncBody(raw: unknown): {
  callLimit: number;
  messageLimit: number;
  maxAgeMinutes: number;
} {
  const defaults = { callLimit: 30, messageLimit: 30, maxAgeMinutes: 2 };
  if (raw == null || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  const cap = (n: unknown, max: number, fallback: number) => {
    const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
    if (!Number.isFinite(v) || v < 0) return fallback;
    return Math.min(Math.floor(v), max);
  };
  return {
    callLimit: cap(o.callLimit, 100, defaults.callLimit),
    messageLimit: cap(o.messageLimit, 100, defaults.messageLimit),
    maxAgeMinutes: cap(o.maxAgeMinutes, 1440, defaults.maxAgeMinutes),
  };
}

export function staleBeforeIso(maxAgeMinutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - Math.max(0, maxAgeMinutes));
  return d.toISOString();
}
