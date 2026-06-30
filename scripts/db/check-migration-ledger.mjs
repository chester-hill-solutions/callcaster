#!/usr/bin/env node
/**
 * Compare in-repo client/migrations/*.sql versions against
 * AUTH_migrations.schema_migrations when DATABASE_URL is set.
 *
 * Usage:
 *   node scripts/db/check-migration-ledger.mjs
 *   DATABASE_URL=postgresql://... node scripts/db/check-migration-ledger.mjs
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = join(import.meta.dirname, "../..");
const MIGRATIONS_DIR = join(ROOT, "client/migrations");

/** Ledger version = numeric prefix before the first `_` in the filename. */
function versionFromFilename(name) {
  const match = name.match(/^(\d+)_/);
  if (!match) {
    throw new Error(`Unexpected migration filename: ${name}`);
  }
  return match[1];
}

function loadRepoVersions() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const byVersion = new Map();
  for (const file of files) {
    const version = versionFromFilename(file);
    byVersion.set(version, file);
  }
  return { files, byVersion };
}

async function loadDbVersions(databaseUrl) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const rows = await sql`
      select version
      from AUTH_migrations.schema_migrations
      order by version
    `;
    const byVersion = new Map(rows.map((r) => [r.version, ""]));
    return byVersion;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function reportDiff(label, repoVersions, dbVersions) {
  const missingInDb = [];
  const extraInDb = [];

  for (const version of repoVersions.keys()) {
    if (!dbVersions.has(version)) {
      missingInDb.push(version);
    }
  }
  for (const version of dbVersions.keys()) {
    if (!repoVersions.has(version)) {
      extraInDb.push(version);
    }
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Repo migrations: ${repoVersions.size}`);
  console.log(`DB ledger rows:  ${dbVersions.size}`);

  if (missingInDb.length === 0 && extraInDb.length === 0) {
    console.log("OK — repo and database ledgers match.");
    return 0;
  }

  if (missingInDb.length > 0) {
    console.log("\nIn repo but NOT in database:");
    for (const v of missingInDb) {
      console.log(`  ${v}  ${repoVersions.get(v)}`);
    }
  }
  if (extraInDb.length > 0) {
    console.log("\nIn database but NOT in repo:");
    for (const v of extraInDb) {
      console.log(`  ${v}  ${dbVersions.get(v)}`);
    }
  }
  return 1;
}

async function main() {
  const { files, byVersion: repoVersions } = loadRepoVersions();
  console.log(`Found ${files.length} migration files in client/migrations/`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      "\nDATABASE_URL not set — repo inventory only. Set DATABASE_URL to compare against a database ledger.",
    );
    for (const file of files) {
      console.log(`  ${versionFromFilename(file)}  ${file}`);
    }
    process.exit(0);
  }

  let dbVersions;
  try {
    dbVersions = await loadDbVersions(databaseUrl);
  } catch (err) {
    console.error("\nFailed to query AUTH_migrations.schema_migrations:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }

  const code = reportDiff("Ledger comparison", repoVersions, dbVersions);
  process.exit(code);
}

main();
