#!/usr/bin/env node
/**
 * Compare in-repo client/migrations/*.sql versions against the union of the
 * database's two ledgers when DATABASE_URL is set:
 * AUTH_migrations.schema_migrations (hand-applied era) and
 * public.client_migration_bootstrap (boot-bootstrap era, #1447).
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

/**
 * The database has TWO ledgers (#1447): AUTH_migrations.schema_migrations
 * (version-keyed, written by the original hand-applies and frozen since the
 * boot bootstrap took over) and public.client_migration_bootstrap
 * (filename-keyed, written by applyClientMigrationsOnBoot). A migration is
 * applied if it appears in EITHER, so the comparison unions them.
 */
async function loadDbVersions(databaseUrl) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const authRows = await sql`
      select version
      from AUTH_migrations.schema_migrations
      order by version
    `;
    const byVersion = new Map(authRows.map((r) => [r.version, ""]));

    // Absent on legacy / pre-bootstrap databases — treat as empty, but say so:
    // silently ignoring a query failure here would recreate the vacuous-pass
    // problem this script exists to prevent.
    let bootstrapRows = [];
    try {
      bootstrapRows = await sql`
        select filename
        from public.client_migration_bootstrap
        order by filename
      `;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/client_migration_bootstrap.*does not exist|relation .* does not exist/i.test(message)) {
        throw err;
      }
      console.warn(
        "note: public.client_migration_bootstrap does not exist on this database " +
          "(pre-bootstrap or legacy) — comparing against AUTH_migrations only.",
      );
    }
    for (const row of bootstrapRows) {
      const match = row.filename.match(/^(\d+)_/);
      if (match) {
        byVersion.set(match[1], row.filename);
      }
    }

    return {
      byVersion,
      authCount: authRows.length,
      bootstrapCount: bootstrapRows.length,
    };
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

  let ledger;
  try {
    ledger = await loadDbVersions(databaseUrl);
  } catch (err) {
    console.error("\nFailed to query the database ledgers:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }

  console.log(
    `DB ledgers: AUTH_migrations=${ledger.authCount} rows, client_migration_bootstrap=${ledger.bootstrapCount} rows`,
  );
  const code = reportDiff("Ledger comparison", repoVersions, ledger.byVersion);
  process.exit(code);
}

main();
