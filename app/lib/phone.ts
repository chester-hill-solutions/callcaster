/**
 * Phone number utilities — canonical helpers for normalizing, parsing, and
 * validating phone numbers.
 *
 * Conventions:
 * - `normalizePhoneNumber` throws on invalid input (E.164 output).
 * - `parsePhoneNumber` returns null on invalid input (lenient CSV/parse path).
 * - `isValidPhoneNumber` / `isPhoneNumber` share one regex.
 */

/**
 * Phone number validation regex pattern.
 * Matches common North American phone number formats including parenthesized
 * area codes, optional leading country code, and common separators.
 */
export const phoneRegex =
  /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

/**
 * NANP structure: +1 NXX XXX-XXXX where the area code N is 2-9 — so
 * "+10555550100" is not a dialable number even though it is 11 digits.
 * The exchange code technically has the same N constraint, but enforcing it
 * would reject the ubiquitous 555-123-4567 style of legacy/test data and
 * silently null contacts on import, so only the area code is checked.
 */
const NANP_E164_PATTERN = /^\+1[2-9]\d{9}$/;

/**
 * Expand spreadsheet scientific notation ("1.5556667777E+10") back into its
 * digit string. Returns null unless every digit of the original number
 * survives in the mantissa — a rounded export like "1.55567E+10" would
 * otherwise fabricate a plausible-looking wrong number ending in zeros.
 */
function expandScientificNotation(raw: string): string | null {
  const match = /^(\d)(?:\.(\d+))?[eE]\+?(\d{1,2})$/.exec(raw.trim());
  if (!match) return null;
  const mantissaDigits = `${match[1]}${match[2] ?? ""}`;
  const exponent = Number(match[3]);
  if (mantissaDigits.length !== exponent + 1) return null;
  return mantissaDigits;
}

/**
 * Shared normalization core: strip punctuation, expand spreadsheet
 * scientific notation, add the +1 country code to bare ten-digit numbers,
 * and require a structurally valid NANP number. Returns null on anything
 * that is not a dialable North American number (international input is
 * intentionally rejected — dialing/billing is NANP-only today).
 */
function toE164Nanp(input: string): string | null {
  const scientific = expandScientificNotation(input);
  let cleaned = (scientific ?? input).replace(/[^0-9+]/g, "");

  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }
  const digits = cleaned.replace(/^\+/, "");

  const withCountry =
    digits.length === 10 ? `1${digits}` : digits;
  if (withCountry.length !== 11 || !withCountry.startsWith("1")) {
    return null;
  }

  const e164 = `+${withCountry}`;
  return NANP_E164_PATTERN.test(e164) ? e164 : null;
}

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * @param input - Raw phone number input
 * @returns Normalized phone number in E.164 format
 * @throws {Error} when input is empty, the wrong length, or not a valid NANP number
 */
export function normalizePhoneNumber(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Phone number input must be a non-empty string");
  }

  const normalized = toE164Nanp(input);
  if (normalized == null) {
    throw new Error("Invalid phone number length");
  }
  return normalized;
}

/**
 * Parse a phone number into E.164 format, returning null (or "" for null input)
 * when the value cannot be normalized. Used by lenient/CSV parse paths.
 */
export function parsePhoneNumber(input: string | null): string | null {
  if (!input) {
    return "";
  }
  return toE164Nanp(input);
}

/**
 * Validate if a string matches a phone number pattern.
 * @param phoneNumber - Phone number string to validate
 * @returns True if the phone number matches the pattern
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return false;
  }
  return phoneRegex.test(phoneNumber);
}

/**
 * Alias for {@link isValidPhoneNumber} — kept for callers that use the
 * `isPhoneNumber` name. Shares the canonical regex so there is one source of
 * truth for phone validation.
 */
export const isPhoneNumber = isValidPhoneNumber;

export const stripPhoneNumber = (phoneNumber: string): string =>
  phoneNumber.replace(/\D/g, "");
