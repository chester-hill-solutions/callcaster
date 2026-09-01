#!/usr/bin/env node
/* eslint-env node */
/**
 * Fail when a pgEnum value in app/db/*.ts is created by no SQL in the repo.
 *
 * check-db-rpcs asks whether functions exist; db:schema:check asks whether a
 * live database has the objects the app names. Neither compared enum VALUES,
 * which is how #1168 added 'waiting' to campaign_status in schema.ts alone
 * and the campaign_schedule_sync job dead-lettered every minute in production
 * for weeks behind green CI (#1476). All logic is in
 * scripts/lib/schema-enums.mjs as pure text extraction (no database); this is
 * the thin CLI, same split as check-db-rpcs.mjs / app-db-objects.mjs.
 *
 * To fix a failure: add a client/migrations file containing
 *   ALTER TYPE public.<enum> ADD VALUE IF NOT EXISTS '<value>';
 * as its ONLY statement (no BEGIN/COMMIT, and nothing that uses the value —
 * see 20260901000000_campaign_status_add_waiting.sql for why), then wire it
 * into `steps` in scripts/db/bootstrap-fresh-db.mjs and
 * scripts/e2e/bootstrap-compose-db.mjs.
 *
 * Usage:
 *   node scripts/db/check-schema-enums.mjs            # gate
 *   node scripts/db/check-schema-enums.mjs --verbose  # + every enum's values
 */
import { join } from "node:path";

import { checkSchemaEnums, ENUM_LINEAGE_DIRS } from "../lib/schema-enums.mjs";

const ROOT = join(import.meta.dirname, "../..");
const verbose = process.argv.includes("--verbose");

const { gaps, schemaEnums, sqlEnums } = checkSchemaEnums(ROOT);

if (verbose) {
  for (const [name, { file, values }] of schemaEnums) {
    const created = sqlEnums.get(name.toLowerCase());
    console.log(`${name} (${file})`);
    console.log(`  schema: ${values.join(", ")}`);
    console.log(`  sql:    ${created ? [...created].join(", ") : "(never created)"}`);
  }
}

if (gaps.length === 0) {
  console.log(
    `[check-schema-enums] OK: ${schemaEnums.size} pgEnum(s) in app/db, every value created by ${ENUM_LINEAGE_DIRS.join(" + ")}.`,
  );
  process.exit(0);
}

console.error(
  "[check-schema-enums] pgEnum value(s) declared in app/db but created by no SQL in " +
    `${ENUM_LINEAGE_DIRS.join(" or ")}:\n` +
    gaps
      .map((gap) =>
        gap.value === null
          ? `  ${gap.enum} (${gap.file}): type is never created`
          : `  ${gap.enum}.'${gap.value}' (${gap.file})`,
      )
      .join("\n") +
    "\n\nThe app will write this value and Postgres will reject it with\n" +
    "`invalid input value for enum` (Drizzle hides that cause behind \"Failed query\").\n" +
    "Add a client/migrations file whose only statement is\n" +
    "  ALTER TYPE public.<enum> ADD VALUE IF NOT EXISTS '<value>';\n" +
    "and wire it into `steps` in scripts/db/bootstrap-fresh-db.mjs and\n" +
    "scripts/e2e/bootstrap-compose-db.mjs. See the header of\n" +
    "client/migrations/20260901000000_campaign_status_add_waiting.sql.",
);
process.exit(1);
