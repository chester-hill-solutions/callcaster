import type { TwilioSmsSenderClass, TwilioTrafficClass } from "@/lib/types";

const TOLL_FREE_NPA = new Set([
  "800",
  "888",
  "877",
  "866",
  "855",
  "844",
  "833",
]);

export function classifyPhoneNumberSenderType(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length > 0 && digits.length <= 6) {
    return "short_code";
  }
  const national = digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length >= 10) {
    const npa = national.slice(0, 3);
    if (TOLL_FREE_NPA.has(npa)) {
      return "toll_free";
    }
  }
  return "local";
}

export function inferSmsSenderClassFromSenderTypes(
  senderTypes: string[],
): TwilioSmsSenderClass {
  const normalized = senderTypes.map((value) => value.toLowerCase());
  if (normalized.some((value) => value.includes("short"))) {
    return "ca_short_code";
  }
  if (normalized.some((value) => value.includes("toll"))) {
    return "verified_toll_free";
  }
  if (normalized.some((value) => value.includes("10dlc"))) {
    return "us_a2p10dlc";
  }
  if (
    normalized.some(
      (value) =>
        value.includes("local") ||
        value.includes("mobile") ||
        value.includes("long"),
    )
  ) {
    return "ca_local";
  }
  return "unknown";
}

export function detectTwilioTrafficClassFromSenderTypes(
  senderTypes: string[],
): TwilioTrafficClass {
  const normalized = senderTypes.map((value) => value.toLowerCase());
  if (normalized.some((value) => value.includes("short"))) {
    return "short_code";
  }
  if (normalized.some((value) => value.includes("toll"))) {
    return "toll_free";
  }
  if (normalized.some((value) => value.includes("alpha"))) {
    return "alphanumeric";
  }
  if (normalized.some((value) => value.includes("10dlc"))) {
    return "a2p10dlc";
  }
  if (
    normalized.some(
      (value) =>
        value.includes("local") ||
        value.includes("mobile") ||
        value.includes("long"),
    )
  ) {
    return "international_long_code";
  }
  return "unknown";
}

export function summarizeTwilioNumberCapabilities(args: {
  sms?: boolean;
  mms?: boolean;
  voice?: boolean;
}): string[] {
  const capabilities: string[] = [];
  if (args.sms) capabilities.push("sms");
  if (args.mms) capabilities.push("mms");
  if (args.voice) capabilities.push("voice");
  return capabilities;
}

export function classifyTwilioPhoneInventory(
  phoneNumbers: Array<{ phoneNumber?: string; capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean } }>,
): {
  senderTypes: string[];
  capabilitySummary: string[];
} {
  const senderTypes = new Set<string>();
  const capabilitySummary = new Set<string>();

  for (const number of phoneNumbers) {
    if (number.phoneNumber) {
      senderTypes.add(classifyPhoneNumberSenderType(number.phoneNumber));
    }
    for (const capability of summarizeTwilioNumberCapabilities(number.capabilities ?? {})) {
      capabilitySummary.add(capability);
    }
  }

  return {
    senderTypes: Array.from(senderTypes),
    capabilitySummary: Array.from(capabilitySummary),
  };
}

/** @deprecated Use inferSmsSenderClassFromSenderTypes with Twilio inventory sender types. */
export { inferSmsSenderClassFromSenderTypes as inferSmsSenderClassFromNumberTypes };
