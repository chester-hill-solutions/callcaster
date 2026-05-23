#!/usr/bin/env node
/* eslint-env node */
/**
 * Move flat app/routes/{flatId}.tsx files to hybrid paths from path-map.json.
 * Target may end with `.route` (→ {path}.route.tsx) or be a folder path (→ {path}.tsx or index).
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");

const pathMap = JSON.parse(fs.readFileSync(PATH_MAP, "utf8"));

function destFile(target) {
  if (target.endsWith(".route")) {
    return `${target}.tsx`;
  }
  const parts = target.split("/");
  const last = parts[parts.length - 1];
  if (last.endsWith("+")) {
    return path.join(target, "index.tsx");
  }
  return `${target}.tsx`;
}

let moved = 0;
for (const [flatId, target] of Object.entries(pathMap)) {
  const src = path.join(ROUTES, `${flatId}.tsx`);
  const dest = path.join(ROUTES, destFile(target));
  if (!fs.existsSync(src)) continue;
  if (fs.existsSync(dest)) {
    console.warn(`skip (dest exists): ${path.relative(ROOT, dest)}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  console.log(`${flatId}.tsx → ${path.relative(ROOT, dest)}`);
  moved++;
}

console.log(`migrated ${moved} file(s)`);
