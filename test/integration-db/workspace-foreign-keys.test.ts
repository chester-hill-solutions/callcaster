import { getTableName } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspace } from "@/db/schema";
import { WORKSPACE_SCOPED_TABLES } from "@/db/workspace-scoped-tables";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const entries = Object.values(WORKSPACE_SCOPED_TABLES);
type Reference = {
  table_name: string;
  column_name: string;
  column_type: string;
  workspace_fk: string | null;
  delete_action: string | null;
  validated: boolean | null;
};
let client: postgres.Sql;
let references: Reference[];

describe("workspace foreign keys over the full tenant registry (#2215)", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Real PostgreSQL URL required");
    client = postgres(databaseUrl, { max: 1 });
    references = await client<Reference[]>`
      select t.relname as table_name, a.attname as column_name,
        format_type(a.atttypid, a.atttypmod) as column_type,
        c.conname as workspace_fk, c.confdeltype as delete_action,
        c.convalidated as validated
      from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and not a.attisdropped
        and a.attnum > 0
      left join pg_constraint c on c.conrelid = t.oid and c.contype = 'f'
        and c.conkey = array[a.attnum]::smallint[]
        and c.confrelid = 'public.workspace'::regclass
        and c.confkey = array[(select attnum from pg_attribute
          where attrelid = 'public.workspace'::regclass and attname = 'id')]::smallint[]
      where n.nspname = 'public' and t.relkind = 'r'
        and a.attname in ('workspace', 'workspace_id')
    `;
  });
  afterAll(async () => {
    await client?.end();
  });

  test("every registered tenant column exists in the real schema", () => {
    expect(entries.length).toBeGreaterThanOrEqual(32);
    const absent = entries.filter((entry) =>
      !references.some((row) =>
        row.table_name === getTableName(entry.table) &&
        row.column_name === entry.workspaceColumnName,
      ),
    );
    expect(absent.map((entry) => getTableName(entry.table))).toEqual([]);
  });

  test("the workspace identifier and tenancy columns agree on UUID types", async () => {
    const [parent] = await client`
      select format_type(atttypid, atttypmod) as id_type
      from pg_attribute where attrelid = 'public.workspace'::regclass
        and attname = 'id' and not attisdropped
    `;
    expect(parent.id_type).toBe("uuid");
    const mismatches = entries.flatMap((entry) => {
      const name = getTableName(entry.table);
      const row = references.find((r) =>
        r.table_name === name && r.column_name === entry.workspaceColumnName,
      );
      return entry.workspaceColumn.getSQLType() === "uuid" &&
        row?.column_type === "uuid"
        ? []
        : [`${name}.${entry.workspaceColumnName}`];
    });
    if (workspace.id.getSQLType() !== "uuid") mismatches.push("workspace.id");
    expect(mismatches).toEqual([]);
  });

  test("every tenant column has a validated workspace-id cascade reference", () => {
    const missing = entries.filter((entry) =>
      !references.some((row) =>
        row.table_name === getTableName(entry.table) &&
        row.column_name === entry.workspaceColumnName &&
        row.workspace_fk !== null && row.delete_action === "c" &&
        row.validated === true,
      ),
    );
    expect(missing.map((entry) => getTableName(entry.table)).sort()).toEqual([]);
  });
});
