#!/usr/bin/env node
/* eslint-env node */
/**
 * Lint-quality ratchet: strictness rules (complexity, max-depth, function
 * size, stray console, non-null assertions, import cycles, …) run as
 * `warn` in eslint so editors surface them, and THIS gate turns their count
 * into a ratchet — growth over `scripts/baselines/lint-ratchet.json` fails
 * CI. Existing violations are frozen, not forgiven: every one is a
 * whittle-me-down invitation, and none may be joined by a new one.
 *
 * Why this shape: the repo's proven guard pattern (check:type-safety,
 * check-dry, tools:check-file-size) — ratchet, don't rewrite.
 *
 * Usage:
 *   node scripts/check-lint-ratchet.mjs            # gate
 *   node scripts/check-lint-ratchet.mjs --baseline # rewrite baseline
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BASELINE = join(import.meta.dirname, "baselines", "lint-ratchet.json");

function main() {
  // Same cache location as the `lint` run: after `npm run lint` the cache is
  // warm, so this pass only lints changed files and reports every file's
  // stored messages (warnings included) — the whole tree, without a second
  // full ESLint sweep. A cold/stale cache is still correct: ESLint then
  // simply lints everything.
  const result = spawnSync(
    "npx",
    [
      "eslint",
      ".",
      "--format",
      "json",
      "--cache",
      "--cache-location",
      "./node_modules/.cache/eslint",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
  );

  if (!result.stdout && result.status !== 0 && result.status !== 1) {
    console.error(`check-lint-ratchet: eslint failed to run (status ${result.status})`);
    if (result.stderr) console.error(result.stderr.slice(0, 2000));
    process.exit(2);
  }

  let reports;
  try {
    reports = JSON.parse(result.stdout || "[]");
  } catch {
    console.error("check-lint-ratchet: could not parse eslint JSON output");
    process.exit(2);
  }

  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).counts;
  const counts = {};
  const hardErrors = [];
  // Inline `eslint-disable` comments for a ratcheted rule count as violations
  // of that rule — otherwise an unattended session (or a lazy fix) could zero
  // its count by silencing the warning instead of guarding the code.
  const DISABLE_RE =
    /eslint-disable(?:-next-line)?\b[^\n]*?(@typescript-eslint\/no-non-null-assertion|complexity|max-depth|max-params|max-lines-per-function|no-console|no-return-await|import\/no-cycle)\b/g;
  for (const file of reports) {
    const rel = file.filePath.replace(`${ROOT}/`, "");
    for (const message of file.messages) {
      if (message.severity === 2) {
        hardErrors.push(`${rel}:${message.line} [${message.ruleId}] ${message.message}`);
        continue;
      }
      const rid = message.ruleId;
      if (rid && rid in baseline) counts[rid] = (counts[rid] ?? 0) + 1;
    }
    for (const match of (readFileSync(file.filePath, "utf8").matchAll(DISABLE_RE))) {
      const rid = match[1];
      counts[rid] = (counts[rid] ?? 0) + 1;
    }
  }

  if (process.argv.includes("--baseline")) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ _comment: JSON.parse(readFileSync(BASELINE, "utf8"))._comment, counts }, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `[check-lint-ratchet] baseline rewritten: ${Object.values(counts).reduce((a, b) => a + b, 0)} warnings across ${Object.keys(counts).length} rules`,
    );
    return;
  }

  const deltas = Object.keys(baseline)
    .map((rid) => ({ rid, before: baseline[rid] ?? 0, now: counts[rid] ?? 0 }))
    .filter((d) => d.now > d.before);
  const improved = Object.keys(baseline)
    .map((rid) => ({ rid, before: baseline[rid] ?? 0, now: counts[rid] ?? 0 }))
    .filter((d) => d.now < d.before);

  if (hardErrors.length > 0) {
    console.error(
      `check-lint-ratchet: ${hardErrors.length} eslint error(s) present — run \`npm run lint\`:\n${hardErrors.slice(0, 10).join("\n")}`,
    );
    process.exit(1);
  }

  if (deltas.length === 0) {
    console.log(
      `check-lint-ratchet: ${Object.values(counts).reduce((a, b) => a + b, 0)} ratcheted warnings, no growth versus baseline.`,
    );
    for (const d of improved) {
      console.log(`  improved: ${d.rid} ${d.before} -> ${d.now} (lower the baseline to lock it in)`);
    }
    return;
  }

  console.error(
    [
      "check-lint-ratchet: new lint violations — the ratchet only moves one way.",
      "",
      ...deltas.map(
        (d) => `  ${d.rid}: ${d.before} -> ${d.now} (+${d.now - d.before})`,
      ),
      "",
      "Fix the new violations (extract functions, drop non-null assertions with",
      "real guards, route output through @/lib/logger.server). If a warning is a",
      "false positive, refactor until it is not, or scope an exemption in",
      ".eslintrc.cjs with a reason — do not raise the baseline to pass.",
      "",
      "Baseline: scripts/baselines/lint-ratchet.json (rewrite: npm run tools:lint-ratchet:baseline).",
    ].join("\n"),
  );
  process.exit(1);
}

main();
