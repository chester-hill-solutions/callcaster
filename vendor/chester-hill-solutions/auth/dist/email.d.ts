/**
 * Normalize an email for invite matching and storage.
 * Lowercases, trims, and collapses internal whitespace.
 */
export declare function normalizeEmail(email: string): string;
export declare function emailsMatch(a: string, b: string): boolean;
