import type Twilio from "twilio";
import {
  normalizeAddressRequirement,
  type AddressRequirement,
} from "@/lib/number-address-requirements";

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
      (verification) => verification.tollfreePhoneNumberSid === number.sid,
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

export type AvailableTollFreeNumber = {
  phoneNumber: string;
  friendlyName: string;
  region: string | null;
  locality: string | null;
  /** ISO country of the available number (e.g. "CA"). */
  isoCountry: string | null;
  /** Q43: Twilio regulatory address requirement (none|any|local|foreign). */
  addressRequirements: AddressRequirement;
  capabilities: { sms: boolean; mms: boolean; voice: boolean };
};

/**
 * Search-only helper for available toll-free numbers in a country (Canada-first,
 * `countryCode` defaults to "CA"). This is a thin read wrapper; actual purchase
 * should go through the existing number-purchase infra
 * (`purchaseWorkspaceNumber` in `platform-workspace-numbers.server.ts`) so that
 * billing, emergency-address attachment and Messaging Service enrolment are
 * applied consistently — we deliberately do NOT duplicate purchase logic here.
 */
export async function searchAvailableTollFreeNumbers(args: {
  twilio: Twilio.Twilio;
  countryCode?: string;
  areaCode?: number;
  smsEnabled?: boolean;
  limit?: number;
}): Promise<AvailableTollFreeNumber[]> {
  const countryCode = args.countryCode ?? "CA";
  const results = await args.twilio
    .availablePhoneNumbers(countryCode)
    .tollFree.list({
      limit: args.limit ?? 20,
      smsEnabled: args.smsEnabled ?? true,
      ...(typeof args.areaCode === "number" ? { areaCode: args.areaCode } : {}),
    })
    .catch(() => []);

  return results.map((n) => ({
    phoneNumber: n.phoneNumber ?? "",
    friendlyName: n.friendlyName ?? n.phoneNumber ?? "",
    region: typeof n.region === "string" ? n.region : null,
    locality: typeof n.locality === "string" ? n.locality : null,
    isoCountry: typeof n.isoCountry === "string" ? n.isoCountry : null,
    addressRequirements: normalizeAddressRequirement(n.addressRequirements),
    capabilities: {
      sms: Boolean(n.capabilities?.sms),
      mms: Boolean(n.capabilities?.mms),
      voice: Boolean(n.capabilities?.voice),
    },
  }));
}
