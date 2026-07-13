#!/usr/bin/env node
/**
 * Handler strictness gate (ratchet).
 *
 * Every route `action`/`loader` should be defined through the handler factory
 * (`defineAction`/`defineLoader` in app/lib/handler.server.ts) so auth, input
 * validation, error mapping, and side-effect declaration are centralized and
 * inventoriable — see docs/handler-strictness.md.
 *
 * Ratchet: the 272 existing hand-written handlers are grandfathered per-file in
 * scripts/handlers-baseline.json. The gate FAILS when a file gains a NEW raw
 * (non-factory) handler. Migrating a grandfathered handler lets you lower the
 * baseline; the number only ratchets down.
 *
 * Usage:
 *   node scripts/check-handlers.mjs
 *   node scripts/check-handlers.mjs --update-baseline
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app", "routes");
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];
const BASELINE_PATH = path.join(ROOT, "scripts", "handlers-baseline.json");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (/\.(tsx|ts)$/.test(e.name)) {
      const rel = path.relative(ROOT, path.join(dir, e.name));
      if (!SKIP_FILE.some((re) => re.test(rel))) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Count raw (non-factory) handlers in a file: 0, 1, or 2 (action + loader). */
function rawHandlers(src) {
  let n = 0;
  for (const kw of ["action", "loader"]) {
    const exported =
      new RegExp(`export\\s+const\\s+${kw}\\s*[=:]`).test(src) ||
      new RegExp(`export\\s+async\\s+function\\s+${kw}\\b`).test(src) ||
      new RegExp(`export\\s+function\\s+${kw}\\b`).test(src);
    if (!exported) continue;
    const governed = new RegExp(`export\\s+const\\s+${kw}\\s*=\\s*define(Action|Loader)\\b`).test(src);
    if (!governed) n += 1;
  }
  return n;
}

const perFile = {};
for (const file of walk(ROUTES_DIR)) {
  const raw = rawHandlers(fs.readFileSync(file, "utf8"));
  if (raw > 0) perFile[path.relative(ROOT, file)] = raw;
}

if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(perFile, null, 2) + "\n");
  const total = Object.values(perFile).reduce((a, n) => a + n, 0);
  console.log(`Handlers baseline written: ${Object.keys(perFile).length} files, ${total} raw handlers grandfathered.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
const regressions = [];
for (const [rel, n] of Object.entries(perFile)) {
  const allowed = baseline[rel] ?? 0;
  if (n > allowed) regressions.push(`  ${rel}: ${n} raw handler(s), baseline allows ${allowed}`);
}

if (regressions.length) {
  console.error("Handler strictness gate FAILED — new hand-written handler(s):\n");
  console.error(regressions.join("\n"));
  console.error(
    "\nDefine the action/loader via defineAction/defineLoader (app/lib/handler.server.ts,\n" +
      "docs/handler-strictness.md). After migrating an existing one, run\n" +
      "`npm run tools:handlers:baseline` to ratchet the baseline down.",
  );
  process.exit(1);
}
const total = Object.values(perFile).reduce((a, n) => a + n, 0);
console.log(`Handler gate passed: ${total} raw handlers at/under baseline (ratcheting to 0).`);
