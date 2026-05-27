import type Twilio from "twilio";

export const TOLL_FREE_VERIFICATION_STATUSES = [
  "not_submitted",
  "pending_review",
  "approved",
  "rejected",
  "unknown",
] as const;

export type TollFreeVerificationStatus =
  (typeof TOLL_FREE_VERIFICATION_STATUSES)[number];

export type WorkspaceTollFreeVerificationSummary = {
  phoneNumber: string;
  phoneNumberSid: string | null;
  status: TollFreeVerificationStatus;
  rejectionReason: string | null;
};

function normalizeVerificationStatus(
  value: string | undefined | null,
): TollFreeVerificationStatus {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("approve")) return "approved";
  if (normalized.includes("reject")) return "rejected";
  if (
    normalized.includes("pending") ||
    normalized.includes("review") ||
    normalized.includes("in_progress")
  ) {
    return "pending_review";
  }
  if (normalized.includes("not") && normalized.includes("submit")) {
    return "not_submitted";
  }
  return "unknown";
}

export async function listWorkspaceTollFreeVerificationSummaries(args: {
  twilio: Twilio.Twilio;
  tollFreePhoneNumbers: Array<{ sid?: string; phoneNumber?: string }>;
}): Promise<WorkspaceTollFreeVerificationSummary[]> {
  const verifications = await args.twilio.messaging.v1.tollfreeVerifications
    .list({ limit: 200 })
    .catch(() => []);

  return args.tollFreePhoneNumbers.map((number) => {
    const phoneNumber = number.phoneNumber ?? "";
    const match = verifications.find(
      (verification) =>
        verification.tollfreePhoneNumberSid === number.sid ||
        verification.tollfreePhoneNumber === phoneNumber,
    );

    return {
      phoneNumber,
      phoneNumberSid: number.sid ?? null,
      status: normalizeVerificationStatus(match?.status),
      rejectionReason:
        typeof match?.rejectionReason === "string"
          ? match.rejectionReason
          : null,
    };
  });
}

export function tollFreeVerificationBlocksBulkSms(
  summaries: WorkspaceTollFreeVerificationSummary[],
): boolean {
  return summaries.some(
    (summary) =>
      summary.phoneNumber &&
      summary.status !== "approved" &&
      summary.status !== "unknown",
  );
}
