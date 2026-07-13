/**
 * Normalize an email for invite matching and storage.
 * Lowercases, trims, and collapses internal whitespace.
 */
export function normalizeEmail(email) {
    return email.trim().toLowerCase().replace(/\s+/g, "");
}
export function emailsMatch(a, b) {
    return normalizeEmail(a) === normalizeEmail(b);
}
