#!/usr/bin/env node
/* eslint-env node */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertLocalTarget } from "../lib/local-target-guard.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(rootDir, "client/migrations");
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";
const requested = process.argv[2];
const migrations = readdirSync(migrationsDir)
  .filter((file) => /^\d+_[^/]+\.sql$/.test(file))
  .sort();

assertLocalTarget(databaseUrl, "DATABASE_URL");

function versionOf(filename) {
  return filename.match(/^(\d+)_/)?.[1] ?? null;
}

function migrationPath(filename) {
  if (!migrations.includes(filename)) {
    throw new Error(
      `Unknown migration "${filename}". Use a filename from client/migrations/ or "up".`,
    );
  }
  return path.join(migrationsDir, filename);
}

function stripPsqlMetaCommands(sql) {
  return sql
    .split("\n")
    .filter((line) => !/^\s*\\[A-Za-z]/.test(line))
    .join("\n");
}

async function ensureLedgers(sql) {
  await sql.unsafe(`
    create schema if not exists auth_migrations;
    create table if not exists auth_migrations.schema_migrations (
      version text primary key
    );
    create table if not exists public.client_migration_bootstrap (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function hasExistingApplicationSchema(sql) {
  const [row] = await sql`
    select to_regclass('public.workspace') is not null as present
  `;
  return row.present;
}

async function appliedMigrations(sql) {
  const rows = await sql`
    select filename from public.client_migration_bootstrap order by filename
  `;
  return new Set(rows.map((row) => row.filename));
}

async function applyMigration(sql, filename) {
  const version = versionOf(filename);
  const contents = readFileSync(migrationPath(filename), "utf8");
  if (!version) throw new Error(`Migration has no numeric version: ${filename}`);
  if (/\bcopy\b[\s\S]{0,200}\bfrom\s+stdin/i.test(contents)) {
    throw new Error(`${filename} uses COPY ... FROM stdin, which is not supported by this runner`);
  }

  console.log(`[migrate] applying client/migrations/${filename}`);
  const recordMigration = async (tx) => {
    await tx`
      insert into auth_migrations.schema_migrations (version)
      values (${version})
      on conflict (version) do nothing
    `;
    await tx`
      insert into public.client_migration_bootstrap (filename)
      values (${filename})
      on conflict (filename) do nothing
    `;
  };
  const migrationSql = stripPsqlMetaCommands(contents);
  // Some legacy client migrations contain their own BEGIN/COMMIT block. Do
  // not nest those inside postgres.js' transaction callback.
  if (/^\s*(begin|start transaction|commit|rollback)\b/im.test(migrationSql)) {
    await sql.unsafe(migrationSql);
    await recordMigration(sql);
  } else {
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);
      await recordMigration(tx);
    });
  }
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const hadApplicationSchema = await hasExistingApplicationSchema(sql);
  await ensureLedgers(sql);
  const applied = await appliedMigrations(sql);
  const pending = migrations.filter((filename) => !applied.has(filename));
  const appliedVersions = [...applied]
    .map(versionOf)
    .filter(Boolean)
    .map(Number);
  const highestAppliedVersion = Math.max(0, ...appliedVersions);
  const historicalGaps = pending.filter((filename) => Number(versionOf(filename)) < highestAppliedVersion);

  if (!requested) throw new Error("Usage: make migrate <filename> or make migrate up");
  if (requested !== "up") {
    if (applied.has(requested)) {
      console.log(`[migrate] already applied client/migrations/${requested}`);
    } else {
      await applyMigration(sql, requested);
    }
  } else if (pending.length === 0) {
    console.log("[migrate] database is up to date");
  } else if (hadApplicationSchema && applied.size === 0) {
    throw new Error(
      "Migration ledger is empty on an existing database; refusing to guess its history. " +
        "Use a verified migration filename, or rebuild the local database with make init.",
    );
  } else if (historicalGaps.length > 0) {
    throw new Error(
      "Migration ledger has historical gaps; refusing to apply later migrations first: " +
        historicalGaps.join(", "),
    );
  } else {
    for (const filename of pending) await applyMigration(sql, filename);
    console.log(`[migrate] applied ${pending.length} migration(s)`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
