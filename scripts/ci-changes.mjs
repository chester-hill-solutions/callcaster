#!/usr/bin/env node
/* eslint-env node */
/**
 * CI path scoping: decide which jobs a push/PR actually needs, from the
 * changed-file set. Computed HERE — a plain node script you can run and test
 * locally (pure logic in scripts/lib/ci-changes-lib.mjs, unit-tested in
 * test/ci-changes.test.ts) — instead of inline workflow shell or a
 * third-party filter action.
 *
 * Usage:
 *   node scripts/ci-changes.mjs --base <sha|ref>   # as CI invokes it
 *   git fetch origin dev && node scripts/ci-changes.mjs --base origin/dev
 *
 * Emits GitHub Actions outputs (`app=`, `e2e=`) when GITHUB_OUTPUT is set,
 * and always prints a summary. `app` scopes bundle-guard; `e2e` scopes the
 * E2E workflow; the quality job runs unconditionally (it is the merged-state
 * gate and is cheap since #1389/#1390).
 *
 * Failure policy: when the base cannot be resolved (new branch, unknown ref,
 * no-op range) the output defaults to "everything changed". A filter may
 * skip a job only on real evidence — never on uncertainty.
 */
import { appendFileSync } from "node:fs";

import { changedFiles, classify } from "./lib/ci-changes-lib.mjs";

function main() {
  const baseIdx = process.argv.indexOf("--base");
  const base = baseIdx >= 0 ? process.argv[baseIdx + 1] : null;
  const files = base ? changedFiles(base) : null;

  if (!files || files.length === 0) {
    emit({ app: true, e2e: true, degraded: true, files: [] });
    return;
  }

  const { app, e2e } = classify(files);
  emit({ app, e2e, degraded: false, files });
}

function emit({ app, e2e, degraded, files }) {
  const outputs = [`app=${app}`, `e2e=${e2e}`];
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`);
  }
  if (degraded) {
    console.log(
      "[ci-changes] base unresolvable or empty range — running everything (fail safe).",
    );
    return;
  }
  console.log(`[ci-changes] ${files.length} changed file(s) vs base`);
  console.log(`[ci-changes] app=${app} e2e=${e2e}`);
}

main();
