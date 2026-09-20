#!/usr/bin/env node
/**
 * ADR-0004 service-layer boundary: the unscoped admin client is not importable
 * from `app/lib` by default.
 *
 * `adminDb` bypasses workspace tenancy entirely (there is no RLS), so every
 * import is a cross-workspace capability. The route tree already bans it in
 * eslint (`eslint.config.mjs`); this guard extends the rule to the service
 * layer, where the actual tenant reads happen.
 *
 * Ratchet: existing importers are baselined in
 * scripts/baselines/unscoped-db-imports.txt (`<file>::<module>` lines). This
 * check fails on NEW offenders and on STALE baseline entries, so the list can
 * only shrink. Use `createTenantDb` from `@/server/tenant-db` for tenant data.
 *
 * Usage:
 *   node scripts/check-unscoped-db-imports.mjs            # gate
 *   node scripts/check-unscoped-db-imports.mjs --baseline # rewrite baseline
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const LIB_DIR = join(ROOT, "app", "lib");
const BASELINE = join(import.meta.dirname, "baselines", "unscoped-db-imports.txt");

/** Unscoped clients that bypass workspace tenancy. Extend as more are adopted. */
const BANNED_MODULES = ["@/server/admin-db"];

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function importsBannedModule(source, moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const staticImport = new RegExp(`\\bfrom\\s+["']${escaped}["']`);
  const dynamicImport = new RegExp(`\\bimport\\(\\s*["']${escaped}["']\\s*\\)`);
  return staticImport.test(source) || dynamicImport.test(source);
}

function readBaseline() {
  try {
    return new Set(
      readFileSync(BASELINE, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    );
  } catch {
    return new Set();
  }
}

function collectCurrent() {
  const current = new Set();
  for (const file of listSourceFiles(LIB_DIR)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    for (const moduleName of BANNED_MODULES) {
      if (importsBannedModule(source, moduleName)) {
        current.add(`${rel}::${moduleName}`);
      }
    }
  }
  return current;
}

function main() {
  const current = collectCurrent();

  if (process.argv.includes("--baseline")) {
    writeFileSync(BASELINE, `${[...current].sort().join("\n")}\n`);
    console.log(
      `[check-unscoped-db-imports] baseline rewritten: ${current.size} entries`,
    );
    return;
  }

  const baselined = readBaseline();
  const fresh = [...current].filter((key) => !baselined.has(key)).sort();
  const stale = [...baselined].filter((key) => !current.has(key)).sort();

  if (fresh.length === 0 && stale.length === 0) {
    console.log(
      `check-unscoped-db-imports: ${current.size} baselined importer(s), no drift.`,
    );
    return;
  }

  if (fresh.length > 0) {
    console.error(
      `check-unscoped-db-imports FAILED — ${fresh.length} new import(s) of an unscoped client in app/lib:\n`,
    );
    for (const key of fresh) console.error(`  ${key}`);
    console.error(
      `\nUse createTenantDb from @/server/tenant-db, or add an entry to ` +
        `${relative(ROOT, BASELINE)} and justify it in the PR.`,
    );
  }

  if (stale.length > 0) {
    console.error(
      `\ncheck-unscoped-db-imports FAILED — ${stale.length} stale baseline ` +
        `entr${stale.length === 1 ? "y" : "ies"} no longer importing:\n`,
    );
    for (const key of stale) console.error(`  ${key}`);
    console.error(
      "\nRemove them: node scripts/check-unscoped-db-imports.mjs --baseline",
    );
  }

  process.exit(1);
}

main();
