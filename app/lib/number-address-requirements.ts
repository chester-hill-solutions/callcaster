/**
 * Q43: regulatory address requirements for phone-number purchase.
 *
 * Twilio's AvailablePhoneNumber resources expose `addressRequirements`
 * (`none | any | local | foreign`). When it is not `none`, the purchasing
 * (sub)account must hold a validated Twilio Address resource satisfying the
 * requirement, passed as `addressSid` on `incomingPhoneNumbers.create`:
 *
 * - `any`     — any validated address on the account.
 * - `local`   — a validated address in the number's ISO country.
 * - `foreign` — a validated address outside the number's ISO country.
 *
 * This module is pure (no Twilio/DB access) so the satisfaction rules are
 * unit-testable; `platform-workspace-numbers.server.ts` wires it to live data.
 */

export const ADDRESS_REQUIREMENTS = ["none", "any", "local", "foreign"] as const;

export type AddressRequirement = (typeof ADDRESS_REQUIREMENTS)[number];

/**
 * Normalize Twilio's `addressRequirements` string. Missing/unknown values map
 * to "none": Twilio omits the field for unregulated inventory, and its enum is
 * closed — an unexpected value would otherwise hard-block every purchase.
 * Twilio still enforces regulation server-side (before any debit on our side).
 */
export function normalizeAddressRequirement(value: unknown): AddressRequirement {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (ADDRESS_REQUIREMENTS as readonly string[]).includes(normalized)
    ? (normalized as AddressRequirement)
    : "none";
}

export type CandidateAddress = {
  sid: string;
  isoCountry: string;
  /** Twilio `validated` flag — true once the address passed regulatory validation. */
  validated: boolean;
};

export type AddressRequirementResolution =
  | { ok: true; addressSid: string | null }
  | { ok: false; error: string };

/**
 * Short label for surfacing a requirement in UI (null when no address needed).
 */
export function addressRequirementLabel(value: unknown): string | null {
  switch (normalizeAddressRequirement(value)) {
    case "any":
      return "Address required";
    case "local":
      return "Local address required";
    case "foreign":
      return "Foreign address required";
    default:
      return null;
  }
}

/** User-actionable message when no satisfying address exists (toUserMessage-safe). */
export function addressRequirementUserMessage(
  requirement: Exclude<AddressRequirement, "none">,
  numberIsoCountry: string,
): string {
  const country = numberIsoCountry.trim().toUpperCase() || "the number's country";
  switch (requirement) {
    case "local":
      return `This number requires a validated ${country} address on file. Add one in Numbers settings, then retry.`;
    case "foreign":
      return `This number requires a validated address outside ${country}. Add one in Numbers settings, then retry.`;
    case "any":
      return "This number requires a validated address on file. Add one in Numbers settings, then retry.";
    default: {
      const _exhaustive: never = requirement;
      return _exhaustive;
    }
  }
}

/**
 * Decide which (if any) address SID satisfies the number's regulatory
 * requirement. Only validated addresses count. When several qualify, prefer an
 * address in the number's own country (harmless for `any`, impossible to hit
 * for `foreign`).
 */
export function resolveAddressForRequirement(args: {
  requirement: AddressRequirement;
  numberIsoCountry: string;
  addresses: CandidateAddress[];
}): AddressRequirementResolution {
  const { requirement } = args;
  if (requirement === "none") {
    return { ok: true, addressSid: null };
  }

  const numberCountry = args.numberIsoCountry.trim().toUpperCase();

  const matches = args.addresses.filter((address) => {
    if (!address.sid || !address.validated) return false;
    const country = address.isoCountry.trim().toUpperCase();
    if (requirement === "any") return true;
    if (requirement === "local") return country === numberCountry;
    return country !== numberCountry; // foreign
  });

  const preferred =
    matches.find(
      (address) => address.isoCountry.trim().toUpperCase() === numberCountry,
    ) ?? matches[0];

  if (preferred) {
    return { ok: true, addressSid: preferred.sid };
  }

  return {
    ok: false,
    error: addressRequirementUserMessage(requirement, numberCountry),
  };
}

const NANP_TOLL_FREE_AREA_CODES = new Set([
  "800",
  "833",
  "844",
  "855",
  "866",
  "877",
  "888",
]);

/**
 * Whether an E.164/NANP number is toll-free — used to pick the right
 * available-number inventory (local vs tollFree) when looking up a specific
 * number's `addressRequirements` at purchase time.
 */
export function isNanpTollFreeNumber(phoneNumber: string): boolean {
  const digits = phoneNumber.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 && NANP_TOLL_FREE_AREA_CODES.has(national.slice(0, 3));
}
