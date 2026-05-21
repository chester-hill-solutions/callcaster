#!/usr/bin/env node
/* eslint-env node */
/**
 * Remove legacy flat route files and duplicates left after partial renames.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app/routes");

function rm(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true, recursive: true });
  console.log(`removed: ${path.relative(ROOT, p)}`);
  return true;
}

let n = 0;

// Legacy dot-notation flat routes (superseded by workspaces+ / admin+)
for (const ent of fs.readdirSync(ROUTES_DIR)) {
  if (
    ent.startsWith("workspaces_.") ||
    ent.startsWith("admin_.") ||
    ent === "admin.tsx" ||
    ent === "admin.fixed.tsx" ||
    ent === "workspaces.tsx"
  ) {
    if (rm(path.join(ROUTES_DIR, ent))) n++;
  }
}

// Wrong hoists
if (rm(path.join(ROUTES_DIR, "admin+.tsx"))) n++;

// Erroneous nested hybrid under admin+
rm(path.join(ROUTES_DIR, "admin+/workspaces+"));

// route.tsx when sibling *.route.tsx exists (keep consolidated module)
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === "route.tsx") {
      const base = path.basename(dir);
      const sibling = path.join(dir, `${base}.route.tsx`);
      if (fs.existsSync(sibling)) {
        rm(p);
        n++;
      }
    }
  }
}
walk(ROUTES_DIR);

// Empty dirs
function pruneEmpty(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) pruneEmpty(path.join(dir, ent.name));
  }
  if (dir === ROUTES_DIR) return;
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    console.log(`rmdir: ${path.relative(ROOT, dir)}`);
  }
}
pruneEmpty(ROUTES_DIR);

console.log(`cleanup touched ${n} path(s)`);
