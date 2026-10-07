#!/usr/bin/env node
/**
 * Effects strictness guard (ratchet).
 *
 * Every `useEffect` / `useLayoutEffect` in the client tree must carry a
 * structured `@effect` annotation documenting WHAT it is for, WHAT it depends
 * on, and WHICH side effects it performs — see docs/effects-strictness.md.
 *
 * Ratchet model (mirrors tools:routes:baseline): existing un-annotated effects
 * are grandfathered via scripts/effects-baseline.json as a per-file allowance.
 * The check FAILS when a file has MORE un-annotated effects than its baseline
 * (i.e. new debt). Annotating a grandfathered effect lets you lower the
 * baseline; the number only ratchets down.
 *
 * Usage:
 *   node scripts/check-effects.mjs                 # check + regenerate inventory
 *   node scripts/check-effects.mjs --update-baseline
 *
 * As with tools:api:surface, the check WRITES docs/effects-inventory.md; CI's
 * final `git diff --exit-code` catches an un-regenerated (drifted) inventory.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [path.join(ROOT, "app")];
const SKIP_DIR_NAMES = new Set(["node_modules", "archive", "deprecated", "__tests__"]);
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\/test\//, /\/e2e\//];
const BASELINE_PATH = path.join(ROOT, "scripts", "effects-baseline.json");
const DEPS_BASELINE_PATH = path.join(ROOT, "scripts", "effects-deps-baseline.json");
const INVENTORY_PATH = path.join(ROOT, "docs", "effects-inventory.md");

// Required tags for a NEW effect to count as compliant.
import { effectCalls, effectDependencyViolations, isEffectCompliant } from "./lib/effects-lib.mjs";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full);
      if (!SKIP_FILE.some((re) => re.test(rel))) out.push(full);
    }
  }
  return out;
}

/**
 * Grab the JSDoc block (if any) immediately preceding a given char offset.
 * Only whitespace and full-line `//` comments may sit between the block and
 * the effect, and the NEAREST preceding block is used (never a distant one).
 *
 * Implemented as a backward line scan, NOT the regex
 * `/(?:[ \t]*\/\/[^\n]*\n|\s)*$/` it replaces: that pattern backtracks
 * catastrophically on real-world indented sources and burned minutes of CPU
 * per CI run for the same result.
 */
function precedingBlock(src, offset) {
  const before = src.slice(0, offset).replace(/[ \t\r]+$/, "");
  const lines = before.split("\n");
  let gapCount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine === "" || trimmedLine.startsWith("//")) gapCount++;
    else break;
  }
  const trimmed = lines.slice(0, lines.length - gapCount).join("\n");
  if (!trimmed.endsWith("*/")) return "";
  const start = trimmed.lastIndexOf("/*");
  return start < 0 ? "" : trimmed.slice(start + 2, trimmed.length - 2);
}

function parseTags(block) {
  const tags = {};
  for (const line of block.split("\n")) {
    const m = line.match(/@effect(-[a-z-]+)?\s+(.*)$/);
    if (m) {
      const key = m[1] ? `@effect${m[1]}` : "@effect";
      tags[key] = (m[2] || "").trim();
    } else if (/@effect(-[a-z-]+)?\s*$/.test(line)) {
      const k = line.match(/@effect(-[a-z-]+)?/)[0];
      tags[k] = "";
    }
  }
  return tags;
}

function collect() {
  const files = SCAN_DIRS.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));
  const perFile = {}; // rel -> { annotated: [ {tags} ], unannotated: n }
  for (const full of files) {
    const rel = path.relative(ROOT, full);
    const src = fs.readFileSync(full, "utf8");
    for (const call of effectCalls(src, full)) {
      const block = precedingBlock(src, call.offset);
      const tags = parseTags(block);
      const compliant = isEffectCompliant(tags);
      perFile[rel] ??= { annotated: [], unannotated: 0, dependencies: {} };
      if (compliant) {
        perFile[rel].annotated.push({ rel, tags });
        for (const violation of effectDependencyViolations(call, tags["@effect-deps"])) {
          const key = `${rel}::${call.symbol}::${violation}`;
          const previous = perFile[rel].dependencies[key];
          perFile[rel].dependencies[key] = {
            count: (previous?.count ?? 0) + 1,
            line: call.line,
          };
        }
      } else perFile[rel].unannotated += 1;
    }
  }
  return perFile;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function writeInventory(perFile) {
  const rows = [];
  for (const rel of Object.keys(perFile).sort()) {
    for (const e of perFile[rel].annotated) {
      rows.push({
        file: rel,
        purpose: e.tags["@effect"] || "",
        deps: e.tags["@effect-deps"] || "",
        side: e.tags["@effect-side-effects"] || "",
        why: e.tags["@effect-why-not-loader"] || "",
      });
    }
  }
  const total = Object.values(perFile).reduce((a, f) => a + f.annotated.length + f.unannotated, 0);
  const un = Object.values(perFile).reduce((a, f) => a + f.unannotated, 0);
  const lines = [
    "# Effects inventory",
    "",
    "> Generated by `npm run check:effects`. Do not edit by hand.",
    "> Every `useEffect`/`useLayoutEffect` should appear here with its purpose,",
    "> the state it depends on, and the side effects it performs. See",
    "> [effects-strictness.md](./effects-strictness.md).",
    "",
    `**${rows.length}** documented / **${total}** total effects (${un} grandfathered, ratcheting to 0).`,
    "",
    "| File | Purpose | Depends on | Side effects | Why not a loader/fetcher |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) => `| \`${r.file}\` | ${r.purpose} | ${r.deps} | ${r.side} | ${r.why} |`,
    ),
    "",
  ];
  fs.writeFileSync(INVENTORY_PATH, lines.join("\n"));
}

const perFile = collect();
const args = process.argv.slice(2);

if (args.includes("--update-baseline")) {
  const baseline = {};
  for (const [rel, f] of Object.entries(perFile)) if (f.unannotated > 0) baseline[rel] = f.unannotated;
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  const dependencies = Object.fromEntries(
    Object.values(perFile).flatMap((file) => Object.entries(file.dependencies).map(([key, value]) => [key, value.count])),
  );
  fs.writeFileSync(DEPS_BASELINE_PATH, JSON.stringify(dependencies, null, 2) + "\n");
  writeInventory(perFile);
  const total = Object.values(baseline).reduce((a, n) => a + n, 0);
  console.log(`Baseline written: ${Object.keys(baseline).length} files, ${total} grandfathered effects; ${Object.values(dependencies).reduce((sum, count) => sum + count, 0)} dependency mismatches.`);
  process.exit(0);
}

writeInventory(perFile);
const baseline = loadBaseline();
const regressions = [];
for (const [rel, f] of Object.entries(perFile)) {
  const allowed = baseline[rel] ?? 0;
  if (f.unannotated > allowed) {
    regressions.push(`  ${rel}: ${f.unannotated} un-annotated effect(s), baseline allows ${allowed}`);
  }
}

for (const [rel, allowed] of Object.entries(baseline)) {
  const actual = perFile[rel]?.unannotated ?? 0;
  if (actual < allowed) regressions.push(`  ${rel}: stale unannotated allowance ${allowed}, current ${actual}`);
}
const dependencies = Object.fromEntries(Object.values(perFile).flatMap((file) => Object.entries(file.dependencies)));
const dependenciesBaseline = fs.existsSync(DEPS_BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(DEPS_BASELINE_PATH, "utf8"))
  : {};
for (const [key, allowed] of Object.entries(dependenciesBaseline)) {
  if (!Number.isSafeInteger(allowed) || allowed < 1) {
    regressions.push(`  ${key}: invalid dependency allowance ${allowed}`);
    continue;
  }
  const actual = dependencies[key]?.count ?? 0;
  if (actual < allowed) regressions.push(`  ${key}: stale dependency allowance ${allowed}, current ${actual}`);
}
for (const [key, value] of Object.entries(dependencies)) {
  const allowed = dependenciesBaseline[key] ?? 0;
  if (value.count > allowed) {
    regressions.push(`  ${key} (line ${value.line}): ${value.count} occurrence(s), baseline allows ${allowed}`);
  }
}

if (regressions.length) {
  console.error("Effects strictness check FAILED — annotation or dependency ratchet:\n");
  console.error(regressions.join("\n"));
  console.error(
    "\nAdd an @effect annotation (see docs/effects-strictness.md). If you annotated an\n" +
      "existing effect, run `npm run tools:effects:baseline` to ratchet the baseline down.",
  );
  process.exit(1);
}
const documented = Object.values(perFile).reduce((a, f) => a + f.annotated.length, 0);
const grandfathered = Object.values(perFile).reduce((a, f) => a + f.unannotated, 0);
console.log(`Effects check passed: ${documented} documented, ${grandfathered} grandfathered (baseline).`);
