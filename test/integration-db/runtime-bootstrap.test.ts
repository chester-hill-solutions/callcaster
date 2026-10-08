import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { describe, expect, test } from "vitest";
import { applyClientMigrationsOnBoot } from "@/server/bootstrap-migrations.server";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("runtime startup with real PostgreSQL (#2487)", () => {
  async function isolatedDatabase(
    run: (sql: postgres.Sql, databaseUrl: string) => Promise<void>,
  ) {
    if (!databaseUrl) throw new Error("Real database required");
    const name = `cc_bootstrap_${randomUUID().replaceAll("-", "")}`;
    const admin = postgres(databaseUrl, { max: 1 });
    const target = new URL(databaseUrl);
    target.pathname = `/${name}`;
    let sql: postgres.Sql | undefined;
    let created = false;
    try {
      await admin`create database ${admin(name)}`;
      created = true;
      sql = postgres(target.href, { max: 1 });
      await run(sql, target.href);
    } finally {
      try {
        await sql?.end({ timeout: 5 });
        if (created) await admin`drop database ${admin(name)}`;
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  }

  async function fixture(
    files: Record<string, string>,
    run: (rootDir: string) => Promise<void>,
  ) {
    const rootDir = mkdtempSync(path.join(tmpdir(), "cc-runtime-bootstrap-"));
    mkdirSync(path.join(rootDir, "drizzle"));
    mkdirSync(path.join(rootDir, "client", "migrations"), { recursive: true });
    try {
      for (const [file, content] of Object.entries(files)) {
        writeFileSync(path.join(rootDir, file), content);
      }
      await run(rootDir);
    } finally {
      rmSync(rootDir, { recursive: true });
    }
  }

  function boot(rootDir: string, url: string) {
    return applyClientMigrationsOnBoot({
      rootDir,
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "true", DATABASE_URL: url },
    });
  }

  test("the actual production baseline creates login, jobs, and membership tables", async () => {
    await isolatedDatabase(async (sql, url) => {
      const result = await boot(process.cwd(), url);
      expect(result.ran).toBe(true);
      // This is the login query that returned HTTP 500 on the broken preview.
      expect(await sql`select id from public.auth_user where email = 'absent@example.invalid'`).toEqual([]);
      const [tables] = await sql`select to_regclass('public.job') as jobs,
        to_regclass('public.workspace_member') as members,
        to_regclass('public.workspace_events') as events`;
      expect(tables).toEqual({ jobs: "job", members: "workspace_member", events: "workspace_events" });
      const rows = await sql`select filename from public.drizzle_baseline_bootstrap order by filename`;
      expect(rows.map(row => row.filename)).toContain("0004_better_auth.sql");
      expect(rows.map(row => row.filename)).toContain("0008_chs_workspace_membership.sql");
      const repeat = await boot(process.cwd(), url);
      expect(repeat.ran && repeat.baselineApplied).toEqual([]);
    });
  });

  test("each baseline and client file gets a usable schema path after leaks and failure", async () => {
    await fixture({
      "drizzle/0000.sql": "create table public.workspace(id int); select set_config('search_path', '', false);",
      "drizzle/0001.sql": "create table auth_user(id text);",
      "client/migrations/001.sql": "select set_config('search_path', '', false);",
      "client/migrations/002.sql": "begin; select 1 / 0; commit;",
      "client/migrations/003.sql": "create table client_probe(id int); insert into client_probe values (37);",
    }, async rootDir => isolatedDatabase(async (sql, url) => {
      await boot(rootDir, url);
      expect(await sql`select id from public.auth_user`).toEqual([]);
      expect(await sql`select id from public.client_probe`).toEqual([{ id: 37 }]);
      expect(await sql`select filename from public.client_migration_bootstrap order by filename`)
        .toEqual([{ filename: "001.sql" }, { filename: "003.sql" }]);
      // A failed file stays pending and recovers on a later start.
      writeFileSync(path.join(rootDir, "client/migrations/002.sql"), "create table recovered_client(id int);");
      await boot(rootDir, url);
      expect(await sql`select id from public.recovered_client`).toEqual([]);
      expect(await sql`select id from public.client_probe`).toEqual([{ id: 37 }]);
    }));
  });

  test("a tracked partial baseline resumes without replaying its completed file", async () => {
    await fixture({
      // Replaying a completed file would fail: the existing row must survive.
      "drizzle/0000.sql": "drop table public.workspace; select 1 / 0;",
      "drizzle/0001.sql": "create table auth_user(id text);",
    }, async rootDir => isolatedDatabase(async (sql, url) => {
      await sql`create table public.workspace(id int)`;
      await sql`insert into public.workspace values (91)`;
      await sql`create table public.drizzle_baseline_bootstrap(filename text primary key)`;
      await sql`insert into public.drizzle_baseline_bootstrap values ('0000.sql')`;
      await boot(rootDir, url);
      expect(await sql`select id from public.auth_user`).toEqual([]);
      expect(await sql`select id from public.workspace`).toEqual([{ id: 91 }]);
      expect(await sql`select filename from public.drizzle_baseline_bootstrap order by filename`)
        .toEqual([{ filename: "0000.sql" }, { filename: "0001.sql" }]);
      expect((await boot(rootDir, url)).ran).toBe(true);
    }));
  });

  test("an existing schema without our baseline ledger remains untouched", async () => {
    await fixture({
      "drizzle/0000.sql": "delete from public.workspace; create table baseline_should_not_run(id int);",
    }, async rootDir => isolatedDatabase(async (sql, url) => {
      await sql`create table public.workspace(id int)`;
      await sql`insert into public.workspace values (91)`;
      await boot(rootDir, url);
      expect(await sql`select id from public.workspace`).toEqual([{ id: 91 }]);
      const [tables] = await sql`select to_regclass('public.baseline_should_not_run') as unwanted,
        to_regclass('public.drizzle_baseline_bootstrap') as tracking`;
      expect(tables).toEqual({ unwanted: null, tracking: null });
    }));
  });
});
