#!/usr/bin/env node
/**
 * Test echo-shape ratchet (#1931).
 *
 * Flags assertions whose EXPECTED value is an identifier imported from the
 * system under test itself (`expect(sutOutput).toBe(SUT_CONSTANT)`). Any value
 * the SUT chooses passes such a test, so an output expectation must be a
 * literal (or a contract value from elsewhere), never a symbol the
 * implementation owns.
 *
 * Heuristic scope (kept deliberately narrow to avoid false positives):
 *   - only `expect(...).(toBe|toEqual|toContain|toMatchObject)(IDENT)` with a
 *     bare identifier argument;
 *   - IDENT must be imported into the test file from `app/` or `shared/`
 *     (via the `@/` / `@shared/` alias or a `../app` / `../shared` relative);
 *   - `toHaveBeenCalledWith`, expressions, and test-local constants are out of
 *     scope.
 *
 * Ratchet: per-file allowance in scripts/test-echo-baseline.json, starting at
 * 0. Run `node scripts/check-test-echo.mjs --update-baseline` only when a file
 * is gone for good.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const TEST_DIR = rootFlag >= 0 ? path.resolve(ROOT, args[rootFlag + 1]) : path.join(ROOT, "test");
const BASELINE_PATH = path.join(ROOT, "scripts", "test-echo-baseline.json");
const ALIASES = new Map([
  ["@/", "app/"],
  ["@shared/", "shared/"],
]);
const ASSERT_RE =
  /expect\([^;]*?\)\.(?:toBe|toEqual|toContain|toMatchObject)\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
const IMPORT_RE =
  /import\s+(?:type\s+)?(?:\{([^}]*)\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(path.join(dir, entry.name), out);
    else if (/\.test\.(ts|tsx)$/.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

/** True when the module spec resolves into the SUT trees (app/ or shared/). */
function isSutImport(spec) {
  for (const [alias, prefix] of ALIASES) {
    if (spec.startsWith(alias)) return prefix === "app/" || prefix === "shared/";
  }
  return /^(?:\.\.\/)+app\//.test(spec) || /^(?:\.\.\/)+shared\//.test(spec);
}

/** The named identifiers imported from a single `import ... from "spec"`. */
function importedNames(names) {
  if (!names) return [];
  return names
    .split(",")
    .map((n) => n.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, ""))
    .filter((n) => n && /^[A-Za-z_$][\w$]*$/.test(n));
}

function scanFile(rel, src) {
  const sutImports = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    if (!isSutImport(m[2])) continue;
    for (const name of importedNames(m[1])) sutImports.add(name);
  }
  const hits = [];
  for (const m of src.matchAll(ASSERT_RE)) {
    if (sutImports.has(m[1])) {
      const line = src.slice(0, m.index).split("\n").length;
      hits.push(`${rel}:${line}`);
    }
  }
  return hits;
}

const files = walk(TEST_DIR);
const perFile = {};
// The checker's own test embeds echo-shaped FIXTURE strings by design; it is
// the oracle, not the subject.
const SELF_TEST = "test/test-echo-checker.test.ts";
for (const full of files) {
  const rel = path.relative(ROOT, full);
  if (rel === SELF_TEST) continue;
  const src = fs.readFileSync(full, "utf8");
  const hits = scanFile(rel, src);
  if (hits.length) perFile[rel] = hits;
}

if (args.includes("--update-baseline")) {
  const baseline = {};
  for (const [rel] of Object.entries(perFile)) baseline[rel] = 0;
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`Test-echo baseline written: ${Object.keys(baseline).length} files allowed 0.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
  : {};
const regressions = [];
for (const [rel, hits] of Object.entries(perFile)) {
  const allowed = baseline[rel] ?? 0;
  if (hits.length > allowed) regressions.push(`  ${rel}: ${hits.length} hub(s), baseline allows ${allowed}`);
}
if (regressions.length) {
  console.error("Test echo-shape check FAILED — expectations reference SUT exports:\n");
  console.error(regressions.join("\n"));
  for (const hits of Object.values(perFile)) {
    for (const h of hits) console.error(`    ${h}`);
  }
  console.error(
    "\nRewrite the expected value as a literal (the SUT constant is the echo), then lower the baseline.",
  );
  process.exit(1);
}
const total = Object.values(perFile).reduce((a, h) => a + h.length, 0);
console.log(`Test echo check passed: ${total} expect-hits against SUT exports (${Object.keys(perFile).length} file(s) monitored).`);