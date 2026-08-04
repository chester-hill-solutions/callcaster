import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for shared secrets.
 *
 * `===` short-circuits on the first differing byte, which leaks how much of a
 * guess was correct. Use this for anything an attacker supplies and we compare
 * against a secret: API keys, webhook signatures, cron headers.
 *
 * The length check is not constant-time and does not need to be — the length of
 * a secret is not the secret.
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
