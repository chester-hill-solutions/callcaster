#!/usr/bin/env node
/**
 * DRY gate (ratcheting dimension).
 *
 * Runs jscpd (config in .jscpd.json) over app/server/worker/shared and compares
 * the copy-paste clone count + duplicated-line count to a checked-in baseline
 * (scripts/dry-baseline.json). Both may only ratchet DOWN — a net-new clone
 * fails CI. Enforces the "2+ consumers → centralize" rule structurally.
 *
 * Usage:
 *   node scripts/check-dry.mjs           # fail if duplication increased
 *   node scripts/check-dry.mjs --update  # rewrite baseline (down only)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts", "dry-baseline.json");
const REPORT_PATH = path.join(ROOT, "node_modules", ".cache", "jscpd", "jscpd-report.json");

// jscpd reads .jscpd.json; run it and let it write the JSON report.
try {
  execFileSync("npx", ["jscpd"], { cwd: ROOT, stdio: "ignore" });
} catch {
  // jscpd exits non-zero when its own --threshold is exceeded; we don't set one,
  // but guard anyway — the report is still written, and our baseline is the gate.
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error("DRY gate: jscpd report not found — is jscpd installed and .jscpd.json valid?");
  process.exit(2);
}
const t = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")).statistics.total;
const current = { clones: t.clones, duplicatedLines: t.duplicatedLines };

if (process.argv.includes("--update")) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ ...current, percentage: Number(t.percentage.toFixed(2)) }, null, 2) + "\n",
  );
  console.log(`DRY baseline written: ${current.clones} clones, ${current.duplicatedLines} duplicated lines.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
const regressions = [];
for (const key of ["clones", "duplicatedLines"]) {
  const allowed = baseline[key] ?? 0;
  if (current[key] > allowed) regressions.push(`  ${key}: ${current[key]} (baseline ${allowed}, +${current[key] - allowed})`);
}

if (regressions.length) {
  console.error("DRY gate FAILED — duplication increased:\n");
  console.error(regressions.join("\n"));
  console.error(
    "\nExtract the duplicated block into a shared function/module/hook (2+ consumers →\n" +
      "centralize). To ratchet DOWN after de-duplicating, run `npm run tools:dry:baseline`.",
  );
  process.exit(1);
}
console.log(`DRY gate passed: ${current.clones} clones / ${current.duplicatedLines} duplicated lines (baseline ${baseline.clones}/${baseline.duplicatedLines}).`);
