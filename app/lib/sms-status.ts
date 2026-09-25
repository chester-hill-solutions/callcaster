import type { OutreachDisposition, TwilioSmsStatus } from "@/lib/twilio.types";
import { TERMINAL_BILLABLE_SMS_STATUSES } from "@/lib/pricing";

const VALID_SMS_STATUSES: TwilioSmsStatus[] = [
  "accepted",
  "scheduled",
  "canceled",
  "queued",
  "sending",
  "sent",
  "failed",
  "delivered",
  "undelivered",
  "receiving",
  "received",
  "read",
];

const TERMINAL_SMS_STATUSES = new Set<TwilioSmsStatus>(
  TERMINAL_BILLABLE_SMS_STATUSES,
);

/**
 * Provider states after which a message can never change again.
 *
 * This is NOT the billing-terminal set. `read` and `canceled` are real terminal
 * states that never trigger a second credit debit, so a campaign gated on the
 * billing set would never finish when a message settles to `canceled` (STOP
 * cancellation, campaign end-date cancellation).
 *
 * `sent` is deliberately absent. It is the intermediate step between `sending`
 * and `delivered`; a campaign is not complete while messages sit in it.
 *
 * A NULL status is also unsettled — see `isSettledSmsStatus`.
 *
 * Source: docs/remediation/critical-review-orchestration-plan-2026-07-12.md
 * (#2048)
 */
export const SETTLED_SMS_STATUSES = [
  "delivered",
  "read",
  "canceled",
  "failed",
  "undelivered",
] as const satisfies readonly TwilioSmsStatus[];

const SETTLED_SMS_STATUS_SET = new Set<TwilioSmsStatus>(SETTLED_SMS_STATUSES);

/**
 * True when a message has reached a provider state it cannot leave.
 *
 * Used by the campaign completion gate (#2048) so a campaign stays running
 * while Twilio still holds messages in `accepted`, `scheduled`, `queued`,
 * `sending`, or `sent`. NULL counts as unsettled: the intent row exists but the
 * provider has not reported a state yet, which mirrors how the IVR gate treats
 * a NULL call status.
 */
export function isSettledSmsStatus(status: TwilioSmsStatus | null): boolean {
  return status != null && SETTLED_SMS_STATUS_SET.has(status);
}

/** Twilio may send `SmsStatus` or `MessageStatus` depending on callback type. */
export function pickRawTwilioSmsStatus(payload: {
  SmsStatus?: string | null;
  MessageStatus?: string | null;
}): string | null {
  const raw = payload.SmsStatus || payload.MessageStatus || null;
  return raw != null && String(raw).trim() !== "" ? String(raw) : null;
}

export function normalizeSmsStatus(
  status: string | null | undefined,
): TwilioSmsStatus | null {
  if (status == null || status === "") {
    return null;
  }
  const normalized = status.toLowerCase() as TwilioSmsStatus;
  return VALID_SMS_STATUSES.includes(normalized) ? normalized : null;
}

export function isTerminalSmsStatus(status: TwilioSmsStatus | null): boolean {
  return status != null && TERMINAL_SMS_STATUSES.has(status);
}

export function smsStatusToOutreachDisposition(
  status: TwilioSmsStatus,
): OutreachDisposition {
  return status;
}
