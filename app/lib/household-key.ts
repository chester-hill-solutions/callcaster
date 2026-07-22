/**
 * Canonical household key derivation (TS side).
 *
 * A "household" is identified within a workspace by a normalized
 * `address|postal` key. Two contacts whose address + postal normalize to the
 * same key belong to the same household.
 *
 * IMPORTANT: this function MUST stay in lockstep with the SQL function
 * `public.household_key_for(addr text, postal text)` defined in
 * client/migrations/20260722100000_households_backfill.sql — the backfill and
 * any future SQL-side grouping use the SQL twin, while app-side inserts use
 * this one. Parity is enforced by test/household-key-sql-parity.test.ts, which
 * runs both implementations against the same fixture set on a real Postgres.
 * If you change the normalization here, change the SQL function in a new
 * migration and extend the parity fixtures.
 *
 * Normalization rules (identical in both implementations):
 * - Address: lowercase, then every run of characters outside [a-z0-9] becomes
 *   a single space (punctuation, unicode accents, and whitespace all collapse
 *   to one space), then trim. "123 Main St., Apt #4" → "123 main st apt 4".
 * - Postal: lowercase, then strip every character outside [a-z0-9].
 *   "M5V 2T6" → "m5v2t6".
 * - Returns null unless BOTH parts are non-empty after normalization.
 * - Key: `${normalizedAddress}|${normalizedPostal}`.
 */
export function householdKeyFor(
  address: string | null | undefined,
  postal: string | null | undefined,
): string | null {
  const normalizedAddress = (address ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedPostal = (postal ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalizedAddress || !normalizedPostal) return null;
  return `${normalizedAddress}|${normalizedPostal}`;
}
