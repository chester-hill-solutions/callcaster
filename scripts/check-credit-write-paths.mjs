#!/usr/bin/env node
/**
 * D4 guardrail: workspace.credits must only change via the ledger RPC path.
 * Fails on direct Drizzle/SQL credit mutations outside approved modules.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = [
  path.join(ROOT, "app"),
  path.join(ROOT, "worker"),
  // The media-stream Bun service debits credits too (live transcription,
  // coaching cues). It was outside this scan until 2026-07, which is how those
  // debits shipped bypassing shared/billing-keys.ts unnoticed.
  path.join(ROOT, "services"),
  // The Bun web server and the shared/ helpers are equally capable of writing
  // credits; scanning only app/ + worker/ was an accident of what existed when
  // this guard was written.
  path.join(ROOT, "server"),
  path.join(ROOT, "shared"),
  // Deliberately NOT scripts/: seed and repair tooling writes credits directly
  // by design (scripts/e2e/seed-database.mjs), so including it would need an
  // allowlist of legitimate seeders — another hand-maintained list to drift.
  // This guard is about runtime code reaching the ledger.
];

const APPROVED_FILES = new Set([
  "app/lib/transaction-history.server.ts",
  "app/server/db-health.server.ts",
]);

const SKIP_DIR_NAMES = new Set(["node_modules", "archive", "deprecated"]);
const SKIP_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\/test\//,
  /\/e2e\//,
  /\/docs\//,
  /\/drizzle\//,
  /\/client\/migrations\//,
];

const VIOLATION_PATTERNS = [
  {
    pattern: /\.update\s*\(\s*workspace\s*\)[\s\S]{0,200}\.set\s*\(\s*\{[^}]*\bcredits\b/,
    label: "direct workspace.update().set({ credits })",
  },
  {
    pattern: /\.set\s*\(\s*\{[^}]*\bcredits\s*:/,
    label: "drizzle .set({ credits: ... })",
  },
  {
    pattern: /update\s+[\w.]*workspace[\w.]*\s+set\s+[^;]*\bcredits\b/i,
    label: "raw SQL UPDATE workspace SET credits",
  },
  {
    pattern: /workspace\.credits\s*=/,
    label: "workspace.credits assignment",
  },
  {
    pattern: /credits\s*=\s*credits\s*[+-]/,
    label: "in-place credits arithmetic assignment",
  },
  {
    // The TenantDb API — `tdb.workspace.update({ set: { credits } })` — is the
    // idiom this codebase actually prefers, and it was the one shape the guard
    // could not see. Its `set` is a property of an options object, not a
    // chained `.set(...)` call, so none of the patterns above matched it.
    pattern: /\.update\s*\(\s*\{[\s\S]{0,200}?\bset\s*:\s*\{[^}]*\bcredits\b/,
    label: "tdb.<table>.update({ set: { credits } })",
  },
  {
    // `INSERT ... ON CONFLICT DO UPDATE SET credits = ...` writes the column
    // without ever naming an UPDATE statement.
    pattern: /on\s+conflict[\s\S]{0,200}?\bset\b[^;]*\bcredits\b/i,
    label: "raw SQL ON CONFLICT DO UPDATE SET credits",
  },
];

function shouldSkipFile(rel) {
  if (APPROVED_FILES.has(rel)) return true;
  return SKIP_FILE_PATTERNS.some((pattern) => pattern.test(rel));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (shouldSkipFile(rel)) continue;

    const source = fs.readFileSync(file, "utf8");
    if (!/\bcredits\b/.test(source)) continue;

    for (const rule of VIOLATION_PATTERNS) {
      if (rule.pattern.test(source)) {
        violations.push({ rel, label: rule.label });
        break;
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Direct workspace credit writes detected outside ledger path:\n");
  for (const v of violations) {
    console.error(`  ${v.rel}: ${v.label}`);
  }
  process.exit(1);
}

console.log("Credit write path check passed.");
