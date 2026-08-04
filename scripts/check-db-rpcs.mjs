#!/usr/bin/env node
/* eslint-env node */
/**
 * Every Postgres function the application calls must be created by a migration.
 *
 * `claim_next_queue_contact` shipped without one. The application had been
 * calling it since #1091, no migration anywhere defined it, and every call
 * raised `function claim_next_queue_contact(integer, uuid) does not exist`.
 * Because that claim is reached from the Twilio status callback that chains the
 * next dial, the predictive dialer stopped after the first call of every
 * session — and nothing caught it: typecheck cannot see inside a SQL template,
 * no test exercises a dialer turn, and `db:ledger:check` compares migration
 * *versions*, not their contents.
 *
 * This closes that gap with no database. For the other half of the question —
 * whether a *live* database actually has them — see `db:schema:check`, which
 * caught the ACD functions that existed in no migration at all.
 *
 * Usage: node scripts/check-db-rpcs.mjs
 */
import { join } from "node:path";

import { collectCalledRpcs, collectCreatedFunctions } from "./lib/app-db-objects.mjs";

const ROOT = join(import.meta.dirname, "..");

const called = collectCalledRpcs(ROOT);
const created = collectCreatedFunctions(ROOT);

const missing = [...called.keys()].filter((name) => !created.has(name)).sort();

if (missing.length > 0) {
  console.error(
    `check-db-rpcs: ${missing.length} database function(s) are called by the app but created by no migration.\n`,
  );
  for (const name of missing) {
    console.error(`  ${name}()`);
    for (const file of [...called.get(name)].sort()) console.error(`      called from ${file}`);
  }
  console.error(
    "\nEach of these throws `function ... does not exist` at runtime.\n" +
      "Add a migration under client/migrations/ that creates it, or point the\n" +
      "call at the function that actually exists.",
  );
  process.exit(1);
}

console.log(
  `check-db-rpcs: ${called.size} app-invoked database function(s), all created by migrations.`,
);
