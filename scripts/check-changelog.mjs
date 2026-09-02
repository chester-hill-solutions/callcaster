#!/usr/bin/env node
/* eslint-env node */
/**
 * Release changelog gate. Runs on pull requests into master only (see
 * .github/workflows/ci.yml): a release that ships behavior must carry its
 * docs/CHANGELOG.md entries, dated for this release, with an empty
 * Unreleased section left on top. Pure logic lives in
 * scripts/lib/check-changelog-lib.mjs (test/check-changelog.test.ts).
 *
 * Usage:
 *   node scripts/check-changelog.mjs --base <sha|ref>
 *   git fetch origin master && node scripts/check-changelog.mjs --base origin/master
 */
import { readFileSync } from "node:fs";
import { changedFiles } from "./lib/ci-changes-lib.mjs";
import { CHANGELOG_PATH, evaluateChangelog } from "./lib/check-changelog-lib.mjs";

const baseIdx = process.argv.indexOf("--base");
const base = baseIdx >= 0 ? process.argv[baseIdx + 1] : null;
if (!base) {
  console.error("check-changelog: --base <sha|ref> is required");
  process.exit(2);
}

const files = changedFiles(base);
if (files === null) {
  console.error(`check-changelog: could not diff against base "${base}"`);
  process.exit(2);
}

const changelogText = readFileSync(CHANGELOG_PATH, "utf8");
const { ok, problems } = evaluateChangelog({ files, changelogText });

if (ok) {
  console.log(`check-changelog: ok (${files.length} changed file(s), Unreleased is empty)`);
  process.exit(0);
}
for (const problem of problems) {
  console.error(`check-changelog: ${problem}`);
}
process.exit(1);
