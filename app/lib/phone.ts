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
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * @param input - Raw phone number input
 * @returns Normalized phone number in E.164 format
 * @throws {Error} when input is empty or the resulting length is invalid
 */
export function normalizePhoneNumber(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Phone number input must be a non-empty string");
  }

  let cleaned = input.replace(/[^0-9+]/g, "");

  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }

  if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`;
  }

  const expectedLength = 12;
  if (cleaned.length < expectedLength) {
    cleaned = `+1${cleaned.replace("+", "")}`;
  }

  if (cleaned.length !== expectedLength) {
    throw new Error("Invalid phone number length");
  }

  return cleaned;
}

/**
 * Parse a phone number into E.164 format, returning null (or "" for null input)
 * when the value cannot be normalized. Used by lenient/CSV parse paths.
 */
export function parsePhoneNumber(input: string | null): string | null {
  if (input) {
    let cleaned = input.replace(/[^0-9+]/g, "");

    if (cleaned.indexOf("+") > 0) {
      cleaned = cleaned.replace(/\+/g, "");
    }
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned;
    }

    const validLength = 11;
    const minLength = 11;

    if (cleaned.length < minLength + 1) {
      cleaned = "+1" + cleaned.replace("+", "");
    }

    if (cleaned.length !== validLength + 1) {
      return null;
    }
    return cleaned;
  } else {
    return "";
  }
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
