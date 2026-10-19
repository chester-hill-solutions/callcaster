import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { isoTimestamps } from "./schema-timestamps";

/**
 * Platform call-in verification numbers (#2519).
 *
 * Global, not tenant-scoped: the agent dials a CallCaster-owned number and the
 * app matches the caller ID against a pending session. One row is active at a
 * time; the partial unique index in
 * `client/migrations/20261019000001_verification_number.sql` enforces that at
 * the database.
 *
 * Split out of `schema.ts` rather than added inline: the size ratchet treats a
 * new column there as the moment to move a domain out.
 */
export const verification_number = pgTable("verification_number", {
  phone_number: text().notNull().primaryKey(),
  provider_sid: text(),
  label: text(),
  region: text(),
  is_active: boolean().notNull().default(false),
  ...isoTimestamps(),
});
