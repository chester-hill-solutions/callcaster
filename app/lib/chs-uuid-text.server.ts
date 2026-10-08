import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * CHS user identifiers and invitation/feature workspace identifiers remain
 * text, while CallCaster workspace and user primary keys are UUID.
 * Postgres rejects bare text = UUID joins — cast the UUID column.
 * Membership workspace tenancy is UUID and uses an ordinary equality join.
 *
 * See drizzle/0008_chs_workspace_membership.sql and
 * docs/remediation/wave1-membership-migration-2026-07-13.md §7.
 */
export function eqChsTextToUuid(
  textColumn: PgColumn,
  uuidColumn: PgColumn,
): SQL {
  return sql`${textColumn} = (${uuidColumn})::text`;
}
