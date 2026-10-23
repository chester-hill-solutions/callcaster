#!/usr/bin/env node
/* eslint-env node */
/**
 * PII export gate.
 *
 * `.opencode/tools/campaign-sms-report.sh` writes campaign exports into the
 * repository root by default. Those files carry contact names, phone numbers
 * and SMS message bodies, so they must never be committed.
 *
 * `.gitignore` blocks them from being added. This gate makes sure that block
 * still holds: it fails when the git index contains a CSV or PDF in the
 * repository root. It is deliberately root-anchored, so the tracked e2e
 * fixtures under `e2e/fixtures/files/` are unaffected.
 *
 * Usage:
 *   node scripts/check-no-pii-exports.mjs
 */
import { execFileSync } from "node:child_process";
import { rootExportFiles } from "./lib/check-no-pii-exports-lib.mjs";

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
    return out.split("\0").filter(Boolean);
  } catch (error) {
    console.error(`check-no-pii-exports: could not read the git index (${error.message})`);
    process.exit(2);
  }
}

const tracked = trackedFiles();
const offenders = rootExportFiles(tracked);

if (offenders.length === 0) {
  console.log(`check-no-pii-exports: ok (${tracked.length} tracked file(s), no root-level data export)`);
  process.exit(0);
}

console.error(
  "check-no-pii-exports: the repository root contains tracked data-export files.",
);
console.error("These carry contact names, phone numbers and message bodies. Remove them from the index:");
for (const file of offenders) {
  console.error(`  git rm --cached -- "${file}"`);
}
console.error(
  'The .gitignore rules "/*.csv" and "/*.pdf" already block them from being added again.',
);
process.exit(1);
