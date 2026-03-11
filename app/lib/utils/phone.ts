/**
 * Phone Number Utilities
 * Functions for normalizing and validating phone numbers
 */

/**
 * Phone number validation regex pattern
 * Matches common North American phone number formats
 */
export const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX)
 * @param input - Raw phone number input
 * @returns Normalized phone number in E.164 format
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
 * Validate if a string matches a phone number pattern
 * @param phoneNumber - Phone number string to validate
 * @returns True if the phone number matches the pattern
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }
  return phoneRegex.test(phoneNumber);
}

