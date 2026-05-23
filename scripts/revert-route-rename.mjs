#!/usr/bin/env node
/* eslint-env node */
/**
 * Revert domain-named route files back to folder/route.tsx for remix-flat-routes.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app/routes");

const SKIP_NAMES = new Set([
  "route.tsx",
  "index.tsx",
  "layout.tsx",
  "page.tsx",
]);

function isRouteModuleFile(filePath) {
  const base = path.basename(filePath);
  if (!base.endsWith(".tsx")) return false;
  if (SKIP_NAMES.has(base)) return false;
  if (base.endsWith(".server.tsx")) return false;
  return true;
}

function findModules() {
  const files = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (isRouteModuleFile(p)) files.push(p);
    }
  }
  walk(ROUTES_DIR);
  return files.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
}

let reverted = 0;
for (const filePath of findModules()) {
  const dir = path.dirname(filePath);
  const segment = path.basename(filePath, ".tsx");
  const routeDir = path.join(dir, segment);
  const dest = path.join(routeDir, "route.tsx");

  if (fs.existsSync(dest)) {
    console.warn(`skip (route exists): ${path.relative(ROOT, dest)}`);
    continue;
  }

  fs.mkdirSync(routeDir, { recursive: true });
  fs.renameSync(filePath, dest);
  console.log(`reverted: ${path.relative(ROOT, filePath)} -> ${path.relative(ROOT, dest)}`);
  reverted++;
}

console.log(`reverted ${reverted} module(s) to folder/route.tsx`);
