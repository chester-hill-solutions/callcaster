#!/usr/bin/env node
/**
 * Type-safety escape-hatch gate (ratcheting dimension).
 *
 * Counts the type-escape-hatch constructs that silently defeat the compiler —
 * `as any`, `as unknown as`, and `: any` annotations — across the app/server/
 * worker/shared source and compares to a checked-in baseline. The count may
 * only ratchet DOWN: a net-new escape hatch fails CI. `as unknown as` in
 * particular is not caught by any eslint core rule, which is why this is a
 * bespoke gate (see docs/type-safety-strictness.md).
 *
 * Usage:
 *   node scripts/check-type-safety.mjs              # fail if any count increased
 *   node scripts/check-type-safety.mjs --update     # rewrite baseline (down only)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "server", "worker", "shared"].map((d) => path.join(ROOT, d));
const SKIP_DIR = new Set(["node_modules", "archive", "deprecated", "api-generated", "__tests__"]);
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\/test\//, /\.d\.ts$/];
const BASELINE_PATH = path.join(ROOT, "scripts", "type-safety-baseline.json");

const PATTERNS = {
  "as any": /\bas any\b/,
  "as unknown as": /\bas unknown as\b/,
  ": any": /:\s*any\b/,
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      const rel = path.relative(ROOT, path.join(dir, e.name));
      if (!SKIP_FILE.some((re) => re.test(rel))) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function count() {
  const totals = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const code = line.trimStart();
        if (code.startsWith("//") || code.startsWith("*")) continue; // skip comments
        for (const [name, re] of Object.entries(PATTERNS)) if (re.test(line)) totals[name] += 1;
      }
    }
  }
  return totals;
}

const totals = count();
const grand = Object.values(totals).reduce((a, n) => a + n, 0);

if (process.argv.includes("--update")) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ ...totals, total: grand }, null, 2) + "\n");
  console.log(`Type-safety baseline written: ${grand} escape hatches (${JSON.stringify(totals)}).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
const regressions = [];
for (const [name, n] of Object.entries(totals)) {
  const allowed = baseline[name] ?? 0;
  if (n > allowed) regressions.push(`  ${name}: ${n} (baseline ${allowed}, +${n - allowed})`);
}

if (regressions.length) {
  console.error("Type-safety gate FAILED — escape-hatch count increased:\n");
  console.error(regressions.join("\n"));
  console.error(
    "\nRemove the new `as any` / `as unknown as` / `: any` (prefer a real type, a zod\n" +
      "parse at the boundary, or a drizzle `sql` helper). To ratchet DOWN after removing\n" +
      "existing ones, run `npm run tools:type-safety:baseline`. The count only goes down.",
  );
  process.exit(1);
}
console.log(`Type-safety gate passed: ${grand} escape hatches at/under baseline ${JSON.stringify(totals)}.`);
