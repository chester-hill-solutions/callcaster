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
