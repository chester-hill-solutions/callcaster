#!/usr/bin/env node
/**
 * Postgres error-code discipline gate (hard fail, zero tolerance).
 *
 * Drizzle wraps driver errors in DrizzleQueryError with the SQLSTATE on
 * `error.cause`, so a direct `error.code === "23505"` comparison (or a
 * "duplicate key" message sniff) silently misses every ORM-wrapped error.
 * That exact miss shipped the duplicate-campaign-name "Unexpected Server
 * Error" bug behind green CI. All Postgres/PostgREST error branching must go
 * through the helpers in app/lib/parse-utils.server.ts
 * (getPostgresErrorCode / isUniqueViolation / ...), which unwrap the cause
 * chain.
 *
 * This gate fails on any pg error-code literal ("23505", "22P02",
 * "PGRST116", ...) or "duplicate key" message sniff outside the sanctioned
 * helper module. There is no baseline: the count is zero and must stay zero.
 *
 * Usage:
 *   node scripts/check-pg-error-codes.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "server", "worker", "shared", "services"].map((d) =>
  path.join(ROOT, d),
);
const SKIP_DIR = new Set(["node_modules", "archive", "deprecated", "api-generated", "__tests__"]);
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\/test\//, /\.d\.ts$/];

// Files allowed to hold the literals: the canonical helper module, and the
// user-message deny-list (which matches on "duplicate key" to REDACT it).
const ALLOWED = new Set([
  "app/lib/parse-utils.server.ts",
  "app/lib/user-message.ts",
]);

const PATTERNS = {
  // Quote-delimited SQLSTATE literals for data/constraint classes 22 & 23
  // (22P02, 23505, 23503, ...) and PostgREST codes (PGRST116, ...).
  "pg error-code literal": /["'](2[23][0-9A-Z]{3}|PGRST\d+)["']/,
  '"duplicate key" message sniff': /duplicate key/i,
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

const violations = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.trimStart();
      if (code.startsWith("//") || code.startsWith("*")) return; // skip comments
      for (const [name, re] of Object.entries(PATTERNS)) {
        if (re.test(line)) violations.push(`  ${rel}:${i + 1}  [${name}]  ${code.trim()}`);
      }
    });
  }
}

if (violations.length) {
  console.error("Postgres error-code gate FAILED — inline pg error handling found:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nDirect `.code === \"23505\"`-style checks and \"duplicate key\" message\n" +
      "sniffs miss Drizzle-wrapped errors (the SQLSTATE lives on `error.cause`).\n" +
      "Use the helpers from app/lib/parse-utils.server.ts instead:\n" +
      "  isUniqueViolation / isForeignKeyViolation / isInvalidTextRepresentation /\n" +
      "  isNotFoundError, or getPostgresErrorCode + PG_ERROR_CODES for other codes\n" +
      "(add new codes to PG_ERROR_CODES there — never a literal at the call site).",
  );
  process.exit(1);
}
console.log("Postgres error-code gate passed: no inline pg error-code literals outside app/lib/parse-utils.server.ts.");
