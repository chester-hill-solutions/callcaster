#!/usr/bin/env node
/**
 * Compare in-repo client/migrations/*.sql versions against
 * AUTH_migrations.schema_migrations when DATABASE_URL is set.
 *
 * Without DATABASE_URL this can only print the repo inventory — it compares
 * nothing. That is fine for `ci:local` (no database to reach) but useless as a
 * deploy gate, so the no-database path is loud rather than a silent success:
 * a green line here has previously been mistaken for "the ledger is in sync".
 *
 * Pass --require-db (or set LEDGER_CHECK_REQUIRE_DB=1) in any pipeline that is
 * meant to actually gate a deploy; it makes a missing DATABASE_URL a failure
 * instead of a no-op.
 *
 * Usage:
 *   node scripts/db/check-migration-ledger.mjs
 *   DATABASE_URL=postgresql://... node scripts/db/check-migration-ledger.mjs
 *   DATABASE_URL=postgresql://... node scripts/db/check-migration-ledger.mjs --require-db
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

/**
 * Duplicate ledger versions already applied to deployed databases (ARCH-01).
 * These three cannot be renamed without inspecting every deployed ledger, so
 * they are grandfathered; any NEW duplicate version is a hard failure because
 * the ledger comparison below keys by version and would silently collapse it.
 */
const GRANDFATHERED_DUPLICATE_VERSIONS = new Set(["20260705000200"]);

function loadRepoVersions() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const byVersion = new Map();
  const duplicates = [];
  for (const file of files) {
    const version = versionFromFilename(file);
    if (byVersion.has(version) && !GRANDFATHERED_DUPLICATE_VERSIONS.has(version)) {
      duplicates.push(`${version}: ${byVersion.get(version)} vs ${file}`);
    }
    byVersion.set(version, file);
  }
  if (duplicates.length > 0) {
    console.error("Duplicate migration versions (each version must be unique):");
    for (const d of duplicates) console.error(`  ${d}`);
    console.error(
      "Pick a fresh version prefix for the new migration. Never renumber an already-applied one.",
    );
    process.exit(1);
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

  const requireDb =
    process.argv.includes("--require-db") ||
    process.env.LEDGER_CHECK_REQUIRE_DB === "1";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    for (const file of files) {
      console.log(`  ${versionFromFilename(file)}  ${file}`);
    }

    if (requireDb) {
      console.error(
        "\nFAIL: --require-db was set but DATABASE_URL is not. This run gated nothing.",
      );
      process.exit(1);
    }

    console.warn(
      "\nWARNING: DATABASE_URL not set — NOTHING WAS COMPARED.\n" +
        "This is a repo inventory, not a ledger check. A deployed database can\n" +
        "be missing any of the migrations listed above and this run still passes.\n" +
        "To actually gate a deploy, run with DATABASE_URL set and --require-db.",
    );
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
