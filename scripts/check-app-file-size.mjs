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
const EXEMPT = new Set([]);

/**
 * Relative paths under `app/` → maximum permitted line count (inclusive).
 * Do not raise these limits — only lower or delete entries as files shrink.
 */
const BASELINE_ALLOWLIST = {
  // Crossed 800 on 2026-07-31 when workspace_number gained `suspended_at` for
  // the unpaid-rental ladder. Pinned rather than exempted so the ratchet still
  // applies: the next column addition fails here, which is the right moment to
  // split this file by domain (workspace / campaign / telephony / survey)
  // instead of raising the number again.
  "db/schema.ts": 801,
  "lib/platform-data.server.ts": 1080,
  "lib/database/workspace.server.ts": 826,
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
const seenExempt = new Set();

for (const file of await walk(ROOT)) {
  const relFromApp = path
    .relative(ROOT, file)
    .replaceAll("\\", "/");
  if (EXEMPT.has(relFromApp)) {
    seenExempt.add(relFromApp);
    continue;
  }

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

const missingExempt = [...EXEMPT].filter(
  (rel) => !seenExempt.has(rel),
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

if (missingExempt.length > 0) {
  failed = true;
  console.error(
    `Exempt list entries missing on disk (remove from exempt set if deleted):`,
  );
  for (const rel of missingExempt) {
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
