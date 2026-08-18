#!/usr/bin/env node
/* eslint-env node */
/**
 * The queue RPCs must implement the same QueueEntry state machine the
 * TypeScript does.
 *
 * `app/lib/queue-status.ts` owns QUEUE_ENTRY_TRANSITIONS — which campaign_queue
 * columns each lifecycle transition writes. Eighteen plpgsql functions write
 * the same table independently, and four repair migrations (20260716120000,
 * 20260716130000, 20260722120000, 20260803120000) exist because they drifted:
 * functions kept SETting a `status` column the v2 normalization had dropped, so
 * enqueue, the dial loop, and the queue loader each raised
 * `column "status" does not exist` in production. `check-db-rpcs` could not
 * catch any of it — its own header says it cannot see inside a function body.
 *
 * This reads the CURRENT definition of every queue RPC out of the migration
 * lineage (drizzle baseline, then client/migrations, last CREATE OR REPLACE
 * wins) and checks it against the transition table. All logic is in
 * `scripts/lib/queue-rpc-contract.mjs` as a pure `analyze()`; this file is the
 * thin CLI, same split as check-db-rpcs.mjs / app-db-objects.mjs.
 *
 * Usage:
 *   node scripts/check-queue-rpc-contract.mjs            # gate
 *   node scripts/check-queue-rpc-contract.mjs --verbose  # + per-RPC detail
 *   node scripts/check-queue-rpc-contract.mjs --update   # rewrite the baseline
 *
 * WHAT IT CANNOT DO. Level (c), transition coverage, needs a single known
 * destination state, which means an UPDATE whose SET assigns queue_state a bare
 * string literal. An RPC that computes queue_state from a variable or a CASE
 * gets levels (a) and (b) only. It is never skipped silently — the summary
 * prints the level every RPC got and why any is missing.
 *
 * Nor does it know what a WHERE clause guarantees. `claim_next_queue_contact`
 * omits the dequeued_* columns when it moves a row to 'assigned' because it only
 * ever touches rows already in 'queued', where those columns are already NULL.
 * Static parsing cannot prove that, so such cases land in the baseline with the
 * guard named as the reason — see BASELINE_FILE.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyze,
  collectCurrentFunctionDefinitions,
  diffAgainstBaseline,
  selectQueueRpcs,
  LEVEL,
} from "./lib/queue-rpc-contract.mjs";
import { loadQueueEntryTransitions } from "./lib/queue-transitions-source.mjs";

const ROOT = join(import.meta.dirname, "..");
const BASELINE_FILE = join(ROOT, "scripts", "queue-rpc-contract-baseline.json");

const verbose = process.argv.includes("--verbose");
const update = process.argv.includes("--update");

const transitions = loadQueueEntryTransitions(ROOT);
const rpcSources = selectQueueRpcs(collectCurrentFunctionDefinitions(ROOT));
const { violations, checked, vocabulary } = analyze({ rpcSources, transitions });

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
} catch {
  baseline = {};
}

if (update) {
  // Carry `$`-prefixed documentation keys and any reason already written by
  // hand. Regenerating over a curated reason would silently replace "this is
  // safe because of guard X" with the generic complaint — which is exactly the
  // unreasoned entry the file's own note warns about.
  const next = {};
  for (const [key, value] of Object.entries(baseline)) {
    if (key.startsWith("$")) next[key] = value;
  }
  for (const v of violations) next[v.key] = baseline[v.key] ?? v.message;
  writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  const kept = violations.filter((v) => baseline[v.key]).length;
  console.log(
    `check-queue-rpc-contract: baseline rewritten — ${violations.length} known ` +
      `violation(s), ${kept} existing reason(s) preserved. Write a reason for ` +
      `each new entry before committing.`,
  );
  process.exit(0);
}
const { added, stale, carried } = diffAgainstBaseline(violations, baseline);

// ─── Report ───────────────────────────────────────────────────────────────

const label = {
  [LEVEL.DROPPED_COLUMNS]: "b",
  [LEVEL.COLUMN_VOCABULARY]: "a",
  [LEVEL.TRANSITION_COVERAGE]: "c",
};
const full = checked.filter((c) => c.levels.length === 3);
const partial = checked.filter((c) => c.levels.length < 3);

console.log(
  `check-queue-rpc-contract: ${checked.length} campaign_queue RPC(s) against ` +
    `${Object.keys(transitions).length} QueueEntry transition(s).`,
);
console.log(`  lifecycle column vocabulary: ${vocabulary.join(", ")}`);
console.log(`  checked (a)+(b)+(c): ${full.length}   partial: ${partial.length}`);

if (verbose || partial.length > 0) {
  console.log("\n  per-RPC coverage —");
  for (const c of [...checked].sort((x, y) => x.rpc.localeCompare(y.rpc))) {
    const levels = c.levels.map((l) => label[l]).sort().join("+");
    const why = c.notes.length > 0 ? `  — ${c.notes.join("; ")}` : "";
    if (!verbose && c.levels.length === 3) continue;
    console.log(`    (${levels}) ${c.rpc}${why}`);
  }
}

function print(list, heading) {
  console.error(`\n${heading}\n`);
  for (const v of list) {
    console.error(`  ${v.rpc}  [${v.file}]`);
    console.error(`      ${v.message}`);
  }
}

if (added.length > 0) {
  print(added, `check-queue-rpc-contract: ${added.length} NEW queue-RPC contract violation(s).`);
  console.error(
    "\nFix the function in a new client/migrations file, or — if the omission is " +
      "provably safe because of a WHERE guard this static check cannot see — run " +
      "`npm run tools:queue-rpc:baseline` and replace the generated message with " +
      "the guard that makes it safe.",
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.error(
    `\ncheck-queue-rpc-contract: ${stale.length} baseline entr(ies) no longer reproduce —\n`,
  );
  for (const key of stale) console.error(`  ${key}`);
  console.error(
    "\nThese were repaired. Run `npm run tools:queue-rpc:baseline` to drop them; " +
      "the baseline is a ratchet and may only shrink.",
  );
  process.exit(1);
}

if (carried.length > 0) {
  console.log(`  known drift carried in the baseline: ${carried.length}`);
  if (verbose) for (const v of carried) console.log(`    ${v.key}`);
}
console.log("check-queue-rpc-contract: no new drift.");
