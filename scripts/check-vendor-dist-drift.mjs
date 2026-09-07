#!/usr/bin/env node
/* eslint-env node */
/**
 * Vendor source/dist drift check (roadmap E7.1).
 *
 * The vendored packages ship their generated `dist/` in this repo, and the app
 * imports the dist, not the source: a `src/` edit without a rebuild does
 * nothing at runtime, and a hand edit to `dist/` is silently lost on the next
 * rebuild. This rebuilds every vendored package that has a build script and
 * fails if the rebuild changed a single byte of its `dist/` — the committed
 * output must be exactly what the committed source produces.
 *
 * Usage: npm run check:vendor-dist
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// shad-cc is deliberately absent: its tsup build (code splitting on) is not
// deterministic — chunk hashes flip between identical runs — so a byte
// comparison would fail at random. Tracked separately; until its build is
// made reproducible, shad-cc dist changes are reviewed by hand.
const PACKAGES = [
  "vendor/scriptkit/scriptkit-call-script-core",
  "vendor/scriptkit/scriptkit-call-script-react",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function snapshot(distDir) {
  const files = new Map();
  for (const path of walk(distDir)) {
    files.set(relative(distDir, path), createHash("sha256").update(readFileSync(path)).digest("hex"));
  }
  return files;
}

function diffSnapshots(before, after) {
  const changed = [];
  for (const [file, hash] of after) {
    if (before.get(file) !== hash) changed.push(before.has(file) ? `modified ${file}` : `added    ${file}`);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.push(`removed  ${file}`);
  }
  return changed;
}

let failed = false;
for (const pkg of PACKAGES) {
  const pkgDir = join(ROOT, pkg);
  const distDir = join(pkgDir, "dist");
  const before = snapshot(distDir);
  const build = spawnSync("npm", ["--prefix", pkgDir, "run", "build"], { cwd: ROOT, encoding: "utf8" });
  if (build.status !== 0) {
    console.error(`check-vendor-dist: build failed for ${pkg}\n${build.stderr || build.stdout}`);
    failed = true;
    continue;
  }
  const changed = diffSnapshots(before, snapshot(distDir));
  if (changed.length > 0) {
    failed = true;
    console.error(`check-vendor-dist: ${pkg}/dist is not what its source builds (${changed.length} file(s)):`);
    for (const line of changed.slice(0, 20)) console.error(`  ${line}`);
    if (changed.length > 20) console.error(`  … and ${changed.length - 20} more`);
  } else {
    console.log(`check-vendor-dist: ${pkg} — dist matches source (${before.size} files)`);
  }
}

if (failed) {
  console.error(
    "\nRebuild with `npm run vendor:build` and commit the dist alongside the source change. Never edit dist/ by hand.",
  );
  process.exit(1);
}
