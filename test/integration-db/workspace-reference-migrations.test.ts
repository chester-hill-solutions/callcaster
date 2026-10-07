import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { expect, test } from "vitest";

const url = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const parent = "00000000-0000-4000-8000-0000000000ab";
const foreign = "00000000-0000-4000-8000-0000000000cd";
const migrations = [
  {
    file: "20261007000001_uuid_workspace_references.sql",
    tables: ["outreach_attempt", "workspace_events"],
    text: false,
  },
  {
    file: "20261007000002_workspace_audio_workspace_reference.sql",
    tables: ["workspace_audio"],
    text: true,
  },
  {
    file: "20261007000003_workspace_audit_event_workspace_reference.sql",
    tables: ["workspace_audit_event"],
    text: true,
  },
  {
    file: "20261007000004_workspace_member_workspace_reference.sql",
    tables: ["workspace_member"],
    text: true,
  },
];
type Migration = (typeof migrations)[number];
const column = (table: string) => table === "outreach_attempt" ? "workspace" : "workspace_id";

async function fixture(migration: Migration, run: (sql: postgres.Sql, schema: string, apply: () => Promise<void>) => Promise<void>) {
  if (!url) throw new Error("Owned PostgreSQL URL required");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const schema = `workspace_fk_${randomUUID().replaceAll("-", "")}`;
  try {
    await sql.unsafe(`create schema "${schema}"`);
    await sql.unsafe(`create table "${schema}".workspace (id uuid primary key)`);
    await sql.unsafe(`insert into "${schema}".workspace values ($1::uuid)`, [parent]);
    for (const table of migration.tables) {
      const type = migration.text ? "text" : "uuid";
      await sql.unsafe(`create table "${schema}".${table} (
        id integer generated always as identity primary key,
        ${column(table)} ${type} not null, user_id text not null default 'fixture-user')`);
      if (table === "workspace_member") {
        await sql.unsafe(`create unique index workspace_member_workspace_user_idx
          on "${schema}".workspace_member (workspace_id, user_id)`);
      }
    }
    const source = await readFile(new URL(`../../client/migrations/${migration.file}`, import.meta.url), "utf8");
    const apply = async () => {
      try {
        await sql.unsafe(source.replaceAll("public.", `"${schema}".`));
      } catch (error) {
        await sql.unsafe("rollback");
        throw error;
      }
    };
    await run(sql, schema, apply);
  } finally {
    try {
      await sql.unsafe("rollback");
      await sql.unsafe(`drop schema if exists "${schema}" cascade`);
    } finally {
      await sql.end();
    }
  }
}

async function insert(sql: postgres.Sql, schema: string, table: string, workspaceId: string) {
  await sql.unsafe(`insert into "${schema}".${table} (${column(table)}) values ($1)`, [workspaceId]);
}
async function rows(sql: postgres.Sql, schema: string, table: string) {
  return sql.unsafe(`select id, ${column(table)}::text as workspace_id, user_id
    from "${schema}".${table} order by id`);
}
async function reference(sql: postgres.Sql, schema: string, table: string) {
  return sql`select contype, confdeltype, convalidated from pg_constraint
    where conrelid = ${`${schema}.${table}`}::regclass
      and conname = ${`${table}_${column(table)}_fkey`}`;
}

test.each(migrations)("$file preserves rows, validates references, rejects writes and cascades on replay", async (migration) => {
  await fixture(migration, async (sql, schema, apply) => {
    for (const table of migration.tables) await insert(sql, schema, table, parent.toUpperCase());
    await apply();
    await apply();
    for (const table of migration.tables) {
      expect(await rows(sql, schema, table)).toEqual([{ id: 1, workspace_id: parent, user_id: "fixture-user" }]);
      expect(await reference(sql, schema, table)).toEqual([{ contype: "f", confdeltype: "c", convalidated: true }]);
      const [type] = await sql`select format_type(atttypid, atttypmod) as column_type
        from pg_attribute where attrelid = ${`${schema}.${table}`}::regclass
          and attname = ${column(table)}`;
      expect(type.column_type).toBe("uuid");
      await expect(insert(sql, schema, table, foreign)).rejects.toMatchObject({ code: "23503" });
      await expect(sql.unsafe(`update "${schema}".${table} set ${column(table)} = $1 where id = 1`, [foreign])).rejects.toMatchObject({ code: "23503" });
      expect((await rows(sql, schema, table))[0].workspace_id).toBe(parent);
    }
    await sql.unsafe(`delete from "${schema}".workspace where id = $1::uuid`, [parent]);
    for (const table of migration.tables) expect(await rows(sql, schema, table)).toEqual([]);
  });
});

test.each(migrations)("$file refuses an orphan without deleting rows or leaving partial constraints", async (migration) => {
  await fixture(migration, async (sql, schema, apply) => {
    for (const [index, table] of migration.tables.entries()) {
      await insert(sql, schema, table, index === migration.tables.length - 1 ? foreign : parent);
    }
    const before = await Promise.all(migration.tables.map((table) => rows(sql, schema, table)));
    await expect(apply()).rejects.toThrow("orphan workspace rows");
    for (const [index, table] of migration.tables.entries()) {
      expect(await rows(sql, schema, table)).toEqual(before[index]);
      expect(await reference(sql, schema, table)).toEqual([]);
    }
  });
});

test.each(migrations.filter((migration) => migration.text))("$file refuses an invalid UUID without converting or deleting the row", async (migration) => {
  await fixture(migration, async (sql, schema, apply) => {
    const table = migration.tables[0];
    await insert(sql, schema, table, "invalid-workspace");
    await expect(apply()).rejects.toThrow("invalid workspace UUIDs");
    expect(await rows(sql, schema, table)).toEqual([{ id: 1, workspace_id: "invalid-workspace", user_id: "fixture-user" }]);
    const [type] = await sql`select format_type(atttypid, atttypmod) as column_type
      from pg_attribute where attrelid = ${`${schema}.${table}`}::regclass and attname = 'workspace_id'`;
    expect(type.column_type).toBe("text");
    expect(await reference(sql, schema, table)).toEqual([]);
  });
});

test.each(migrations)("$file refuses an existing constraint with the wrong definition and rolls back conversion", async (migration) => {
  await fixture(migration, async (sql, schema, apply) => {
    const table = migration.tables[0];
    await insert(sql, schema, table, parent);
    await sql.unsafe(`alter table "${schema}".${table}
      add constraint ${table}_${column(table)}_fkey check (true)`);
    await expect(apply()).rejects.toThrow("unsupported definition");
    expect(await rows(sql, schema, table)).toEqual([{ id: 1, workspace_id: parent, user_id: "fixture-user" }]);
    const [type] = await sql`select format_type(atttypid, atttypmod) as column_type
      from pg_attribute where attrelid = ${`${schema}.${table}`}::regclass and attname = ${column(table)}`;
    expect(type.column_type).toBe(migration.text ? "text" : "uuid");
    expect((await reference(sql, schema, table))[0].contype).toBe("c");
  });
});

test("membership UUID normalization refuses a duplicate without merging users", async () => {
  const migration = migrations.find((item) => item.tables.includes("workspace_member"));
  if (!migration) throw new Error("Membership migration required");
  await fixture(migration, async (sql, schema, apply) => {
    await insert(sql, schema, "workspace_member", parent);
    await insert(sql, schema, "workspace_member", parent.toUpperCase());
    const before = await rows(sql, schema, "workspace_member");
    await expect(apply()).rejects.toThrow("UUID-normalized membership collision");
    expect(await rows(sql, schema, "workspace_member")).toEqual(before);
    expect(await reference(sql, schema, "workspace_member")).toEqual([]);
  });
});
