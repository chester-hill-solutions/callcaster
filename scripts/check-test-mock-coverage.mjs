#!/usr/bin/env node
/* eslint-env node */
/**
 * Test-mock drift guard: replacing `vi.mock` factories for shared server
 * modules must spread `importOriginal`.
 *
 * Why: a factory like `vi.mock("@/lib/foo.server", () => ({ bar: vi.fn() }))
 * hard-codes the module's export surface at the time it was written. When the
 * real module later gains an export, every route/action importing it through
 * that mock blows up with a TypeError that surfaces as the route's catch-all
 * error — several unrelated-looking test failures for one line of drift (the
 * settings-action breakage behind #1270's guard work was exactly this).
 * Factories that spread `await importOriginal()` stay correct by construction.
 *
 * Ratchet: existing replacing factories are baselined in
 * scripts/baselines/test-mock-replace.txt (file::module lines). This check
 * fails only on NEW offenders, so the pattern can be adopted gradually but
 * drift never grows.
 *
 * Usage:
 *   node scripts/check-test-mock-coverage.mjs            # gate
 *   node scripts/check-test-mock-coverage.mjs --baseline # rewrite baseline
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TEST_DIR = join(ROOT, "test");
const BASELINE = join(import.meta.dirname, "baselines", "test-mock-replace.txt");

// Only guarded for shared server modules: client modules and one-off helpers
// rarely gain exports consumed by route code.
const GUARDED_PATTERN = /^@\/(lib|server)\/.+\.server$/;

const VI_MOCK_RE = /vi\.mock\(\s*(["'])(.+?)\1\s*,\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;

function listTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** vi.mock factories whose parameter list does not bind importOriginal. */
function findReplacingMocks(source) {
  const offenders = [];
  for (const match of source.matchAll(VI_MOCK_RE)) {
    const modulePath = match[2];
    const params = match[3];
    if (!GUARDED_PATTERN.test(modulePath)) continue;
    if (/\bimportOriginal\b/.test(params)) continue;
    offenders.push(modulePath);
  }
  return offenders;
}

function readBaseline() {
  try {
    return readFileSync(BASELINE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const current = new Map(); // "file::module" -> true
  for (const file of listTestFiles(TEST_DIR)) {
    const rel = relative(ROOT, file);
    for (const modulePath of findReplacingMocks(readFileSync(file, "utf8"))) {
      current.set(`${rel}::${modulePath}`, true);
    }
  }

  if (process.argv.includes("--baseline")) {
    writeFileSync(BASELINE, `${[...current.keys()].sort().join("\n")}\n`, "utf8");
    console.log(
      `[check-test-mocks] baseline rewritten: ${current.size} replacing factories`,
    );
    return;
  }

  const baselined = new Set(readBaseline());
  const fresh = [...current.keys()].filter((key) => !baselined.has(key)).sort();

  if (fresh.length === 0) {
    console.log(
      `check-test-mocks: ${current.size} replacing factories, all baselined — no new drift.`,
    );
    return;
  }

  console.error(
    [
      `check-test-mocks: ${fresh.length} new replacing vi.mock factories for shared server modules.`,
      "",
      "Spread the real module so future exports keep flowing:",
      '  vi.mock("@/lib/foo.server", async (importOriginal) => ({',
      '    ...(await importOriginal<typeof import("@/lib/foo.server")>()),',
      "    bar: vi.fn(),",
      "}));",
      "",
      "New offenders:",
      ...fresh.map((key) => `  ${key}`),
      "",
      "If the replacement is genuinely complete and intended to stay frozen,",
      `add the entries to ${relative(ROOT, BASELINE)} (ratchet baseline).`,
    ].join("\n"),
  );
  process.exit(1);
}

main();
