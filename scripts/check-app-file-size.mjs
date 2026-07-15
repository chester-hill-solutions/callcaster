#!/usr/bin/env node
/**
 * Enforces an 800-line soft ceiling on files under `app/`.
 *
 * Ratchet mode (#1048): a baseline allowlist pins known offenders to their
 * current max line count so CI fails on growth or new offenders while still
 * allowing incremental splits (lower an allowlist entry as the file shrinks,
 * then remove it once under MAX_LINES).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("app");
const MAX_LINES = 800;
const EXEMPT = new Set(["lib/database.types.ts"]);

/**
 * Relative paths under `app/` → maximum permitted line count (inclusive).
 * Do not raise these limits — only lower or delete entries as files shrink.
 */
const BASELINE_ALLOWLIST = {
  "lib/openapi-platform.ts": 1209,
  "lib/platform-data.server.ts": 1181,
  "lib/database/workspace.server.ts": 1059,
  "lib/api-surface.ts": 1020,
  "lib/survey-db.server.ts": 928,
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

const offenders = [];
const allowlistViolations = [];
const seenAllowlisted = new Set();

for (const file of await walk(ROOT)) {
  const relFromApp = path
    .relative(ROOT, file)
    .replaceAll("\\", "/");
  if (EXEMPT.has(relFromApp)) continue;

  const content = await readFile(file, "utf8");
  const lines = content.split("\n").length;
  const allowMax = BASELINE_ALLOWLIST[relFromApp];

  if (allowMax != null) {
    seenAllowlisted.add(relFromApp);
    if (lines > allowMax) {
      allowlistViolations.push({
        rel: `app/${relFromApp}`,
        lines,
        allowMax,
      });
    }
    continue;
  }

  if (lines > MAX_LINES) {
    offenders.push({ rel: `app/${relFromApp}`, lines });
  }
}

const missingAllowlisted = Object.keys(BASELINE_ALLOWLIST).filter(
  (rel) => !seenAllowlisted.has(rel),
);

let failed = false;

if (allowlistViolations.length > 0) {
  failed = true;
  console.error(
    `Found ${allowlistViolations.length} allowlisted file(s) that grew past their baseline:`,
  );
  for (const { rel, lines, allowMax } of allowlistViolations.sort(
    (a, b) => b.lines - a.lines,
  )) {
    console.error(`  ${lines}\t${rel}  (baseline max ${allowMax})`);
  }
}

if (offenders.length > 0) {
  failed = true;
  offenders.sort((a, b) => b.lines - a.lines);
  console.error(
    `Found ${offenders.length} new app file(s) over ${MAX_LINES} lines (not on the #1048 baseline allowlist):`,
  );
  for (const { rel, lines } of offenders) {
    console.error(`  ${lines}\t${rel}`);
  }
}

if (missingAllowlisted.length > 0) {
  failed = true;
  console.error(
    `Baseline allowlist entries missing on disk (remove from allowlist if split/deleted):`,
  );
  for (const rel of missingAllowlisted) {
    console.error(`  app/${rel}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `File-size guard OK: no new files over ${MAX_LINES} lines; ${Object.keys(BASELINE_ALLOWLIST).length} baseline allowlist entr(ies) within cap.`,
);
process.exit(0);
