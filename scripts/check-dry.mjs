#!/usr/bin/env node
/**
 * DRY gate (ratcheting, two dimensions).
 *
 * jscpd reports nothing below its token threshold, so choosing one threshold
 * *is* choosing a blind spot. The gate runs two:
 *
 *   coarse — 50 tokens, catches large copy-paste.
 *   fine   — 15 tokens, catches small structural duplication.
 *
 * The gap between them is not academic. Scanned over this repo the coarse pass
 * found 173 clones / 1,853 duplicated lines; the fine pass found 2,309 /
 * 15,957. That 13x is duplication the gate could not see at all, and it
 * included near-identical clones in the campaign IVR and SMS dispatch twins
 * that the coarse pass reported as zero.
 *
 * The duplication the coarse gate misses is the duplication that bites: a
 * blocked-shape copied into a second dispatcher, a zero-count object spelled
 * out at each exit, a rate-limit response rebuilt per route. None of those are
 * big enough to trip a 50-token threshold, and all of them are how a change
 * lands in one copy and not the other.
 *
 * Both dimensions ratchet DOWN independently against
 * scripts/dry-baseline.json. A net-new clone in either fails CI.
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

/** Each dimension is a jscpd config plus the report it writes. */
const DIMENSIONS = [
  { name: "coarse", config: ".jscpd.json", report: "jscpd/jscpd-report.json" },
  { name: "fine", config: ".jscpd-fine.json", report: "jscpd-fine/jscpd-report.json" },
];

const METRICS = ["clones", "duplicatedLines"];

function scan(dim) {
  // jscpd exits non-zero when its own threshold is exceeded; we set none, but
  // guard anyway — the report is still written, and our baseline is the gate.
  try {
    execFileSync("npx", ["jscpd", "--config", dim.config], { cwd: ROOT, stdio: "ignore" });
  } catch {
    /* report still written */
  }
  const reportPath = path.join(ROOT, "node_modules", ".cache", dim.report);
  if (!fs.existsSync(reportPath)) {
    console.error(
      `DRY gate: no jscpd report for the ${dim.name} dimension at ${dim.report} — ` +
        `is jscpd installed and ${dim.config} valid?`,
    );
    process.exit(2);
  }
  const total = JSON.parse(fs.readFileSync(reportPath, "utf8")).statistics.total;
  return {
    clones: total.clones,
    duplicatedLines: total.duplicatedLines,
    percentage: Number(total.percentage.toFixed(2)),
  };
}

const measured = Object.fromEntries(DIMENSIONS.map((dim) => [dim.name, scan(dim)]));

if (process.argv.includes("--update")) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(measured, null, 2) + "\n");
  for (const dim of DIMENSIONS) {
    const m = measured[dim.name];
    console.log(`DRY ${dim.name} baseline: ${m.clones} clones / ${m.duplicatedLines} duplicated lines.`);
  }
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
  : {};

// An old flat baseline would read as zero allowed and blame every clone on
// this change. Say so instead.
if (!DIMENSIONS.every((dim) => baseline[dim.name])) {
  console.error(
    "DRY gate: scripts/dry-baseline.json is not in the two-dimension shape this\n" +
      "gate expects (it needs a `coarse` and a `fine` entry). Run\n" +
      "`npm run tools:dry:baseline` to write it, then commit the result.",
  );
  process.exit(2);
}

const regressions = [];
for (const dim of DIMENSIONS) {
  for (const key of METRICS) {
    const allowed = baseline[dim.name][key] ?? 0;
    const current = measured[dim.name][key];
    if (current > allowed) {
      regressions.push(
        `  ${dim.name} ${key}: ${current} (baseline ${allowed}, +${current - allowed})`,
      );
    }
  }
}

if (regressions.length) {
  console.error("DRY gate FAILED — duplication increased:\n");
  console.error(regressions.join("\n"));
  console.error(
    "\nExtract the duplicated block into a shared function/module/hook (2+ consumers →\n" +
      "centralize). Small structural duplication counts: it is what the `fine`\n" +
      "dimension measures, and it is how a fix lands in one copy and not the other.\n" +
      "To ratchet DOWN after de-duplicating, run `npm run tools:dry:baseline`.",
  );
  process.exit(1);
}

for (const dim of DIMENSIONS) {
  const m = measured[dim.name];
  const b = baseline[dim.name];
  console.log(
    `DRY ${dim.name} passed: ${m.clones} clones / ${m.duplicatedLines} duplicated lines ` +
      `(baseline ${b.clones}/${b.duplicatedLines}).`,
  );
}
