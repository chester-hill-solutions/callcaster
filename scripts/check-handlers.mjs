#!/usr/bin/env node
/**
 * Handler strictness gate (ratchet COMPLETE — hard fail).
 *
 * Every route `action`/`loader` must be defined through the handler factory
 * (`defineAction`/`defineLoader` in app/lib/handler.server.ts) so auth, input
 * validation, error mapping, and side-effect declaration are centralized and
 * inventoriable — see docs/handler-strictness.md.
 *
 * History: 272 hand-written handlers were grandfathered in a per-file baseline
 * and migrated down to zero. The baseline is gone; ANY raw (non-factory)
 * handler now fails this gate outright.
 *
 * Usage:
 *   node scripts/check-handlers.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app", "routes");
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];

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

/** Raw (non-factory) handlers in a file: which of action/loader bypass the factory. */
function rawHandlers(src) {
  const raw = [];
  for (const kw of ["action", "loader"]) {
    const exported =
      new RegExp(`export\\s+const\\s+${kw}\\s*[=:]`).test(src) ||
      new RegExp(`export\\s+async\\s+function\\s+${kw}\\b`).test(src) ||
      new RegExp(`export\\s+function\\s+${kw}\\b`).test(src);
    if (!exported) continue;
    const governed = new RegExp(`export\\s+const\\s+${kw}\\s*=\\s*define(Action|Loader)\\b`).test(src);
    if (!governed) raw.push(kw);
  }
  return raw;
}

let total = 0;
const violations = [];
for (const file of walk(ROUTES_DIR)) {
  const raw = rawHandlers(fs.readFileSync(file, "utf8"));
  if (raw.length > 0) {
    violations.push(`  ${path.relative(ROOT, file)}: raw ${raw.join(" + ")}`);
  }
  total += raw.length;
}

if (violations.length) {
  console.error("Handler strictness gate FAILED — hand-written handler(s) found:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nEvery route action/loader must be defined via defineAction/defineLoader\n" +
      "(app/lib/handler.server.ts, docs/handler-strictness.md). The migration is\n" +
      "complete; there is no grandfather baseline.",
  );
  process.exit(1);
}
console.log("Handler gate passed: every route action/loader goes through the handler factory.");
