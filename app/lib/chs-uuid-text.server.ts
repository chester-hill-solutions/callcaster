import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * CHS `workspace_member` / feature tables store workspace and user ids as text
 * (uuid string), while CallCaster `workspace.id` and `public.user.id` remain
 * uuid. Postgres rejects bare `text = uuid` joins — cast the uuid column.
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
