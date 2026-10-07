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
 * scripts/baselines/test-mock-replace.txt (file::module#count lines). This check
 * fails on new occurrences and stale baseline entries, so repaired debt
 * cannot silently return. Legacy keys without a count mean one occurrence.
 *
 * Usage:
 *   node scripts/check-test-mock-coverage.mjs            # gate
 *   node scripts/check-test-mock-coverage.mjs --baseline # rewrite baseline
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const rootOption = process.argv.find((arg) => arg.startsWith("--root="));
const ROOT = rootOption
  ? resolve(rootOption.slice(7))
  : join(import.meta.dirname, "..");
const TEST_DIR = join(ROOT, "test");
const BASELINE = join(ROOT, "scripts", "baselines", "test-mock-replace.txt");

// Only guarded for shared server modules: client modules and one-off helpers
// rarely gain exports consumed by route code.
const GUARDED_PATTERN = /^@\/(lib|server)\/.+\.server$/;

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
function findReplacingMocks(source, fileName) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const offenders = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "vi" &&
      node.expression.name.text === "mock"
    ) {
      const [module, factory] = node.arguments;
      if (
        module &&
        ts.isStringLiteral(module) &&
        GUARDED_PATTERN.test(module.text) &&
        factory &&
        ts.isArrowFunction(factory) &&
        !factory.parameters.some((param) =>
          /\bimportOriginal\b/.test(param.name.getText(parsed)),
        )
      ) {
        offenders.push(module.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return offenders;
}

function readBaseline() {
  const counts = new Map();
  if (!existsSync(BASELINE)) return counts;
  for (const line of readFileSync(BASELINE, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)) {
    const match = /^(.*)#([1-9]\d*)$/.exec(line);
    const key = match ? match[1] : line;
    const count = match ? Number(match[2]) : 1;
    const module = key.split("::")[1];
    if (
      !module ||
      !GUARDED_PATTERN.test(module) ||
      counts.has(key) ||
      !Number.isSafeInteger(count)
    ) {
      throw new Error(
        `Invalid or duplicate mock baseline entry: ${line}. Run npm run tools:test-mocks:baseline.`,
      );
    }
    counts.set(key, count);
  }
  return counts;
}

function main() {
  const current = new Map(); // "file::module" -> occurrence count
  for (const file of listTestFiles(TEST_DIR)) {
    const rel = relative(ROOT, file);
    for (const modulePath of findReplacingMocks(
      readFileSync(file, "utf8"),
      file,
    )) {
      const key = `${rel}::${modulePath}`;
      current.set(key, (current.get(key) ?? 0) + 1);
    }
  }

  const totalFactories = [...current.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  if (process.argv.includes("--baseline")) {
    writeFileSync(
      BASELINE,
      `${[...current]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}#${count}`)
        .join("\n")}\n`,
      "utf8",
    );
    console.log(
      `[check-test-mocks] baseline rewritten: ${totalFactories} replacing factories across ${current.size} file/module pairs`,
    );
    return;
  }

  const baselined = readBaseline();
  const fresh = [...current].filter(
    ([key, count]) => count > (baselined.get(key) ?? 0),
  );
  const stale = [...baselined].filter(
    ([key, count]) => count > (current.get(key) ?? 0),
  );
  if (stale.length) {
    console.error(`check-test-mocks: ${stale.length} stale baseline entries.`);
    for (const [key, count] of stale)
      console.error(`  ${key}: ${count} -> ${current.get(key) ?? 0}`);
    console.error(
      "Run `npm run tools:test-mocks:baseline` to remove repaired occurrences; the baseline may only shrink.",
    );
  }

  if (fresh.length === 0 && stale.length === 0) {
    console.log(
      `check-test-mocks: ${totalFactories} replacing factories across ${current.size} file/module pairs, all baselined — no new drift.`,
    );
    return;
  }

  if (fresh.length === 0) process.exit(1);
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
      ...fresh.map(
        ([key, count]) => `  ${key}: ${baselined.get(key) ?? 0} -> ${count}`,
      ),
      "",
      "If the replacement is genuinely complete and intended to stay frozen,",
      `add the entries to ${relative(ROOT, BASELINE)} (ratchet baseline).`,
    ].join("\n"),
  );
  process.exit(1);
}

main();
