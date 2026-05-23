#!/usr/bin/env node
/* eslint-env node */
/**
 * Rename route.tsx → domain-named modules for remix-flat-routes:
 *
 * - Top-level (no / in path): signin/route.tsx → signin.tsx
 * - Direct child of hybrid+ root (api+, workspaces+, …): api+/numbers/route.tsx → api+/numbers.tsx
 * - Nested under params/folders: settings/route.tsx → settings.route.tsx (sibling to settings/ when layout has children)
 * - Nested leaf: numbers/route.tsx → numbers.route.tsx (same directory)
 * - _index/route.tsx → _index/index.tsx
 *
 * Plain nested names like settings/numbers.tsx under $id/ are NOT registered by
 * remix-flat-routes (only route.tsx, index.tsx, layout.tsx, page.tsx, _*.tsx, *.route.tsx).
 * Use *.route.tsx for layout siblings (settings.route.tsx + settings/numbers.route.tsx),
 * or hybrid+ colocation (settings+/numbers.tsx → URL settings/numbers).
 * index.tsx is only required for hybrid root indexes (workspaces+/index.tsx) and _index.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app/routes");
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");
const HYBRID_ROOTS = new Set(["workspaces+", "api+", "admin+", "survey+"]);

function parseArgs() {
  return { dryRun: process.argv.includes("--dry-run") };
}

function findRouteModules() {
  const modules = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === "route.tsx") modules.push(p);
    }
  }
  walk(ROUTES_DIR);
  return modules.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
}

function hasChildRouteDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some((ent) => ent.isDirectory());
}

function relDir(routePath) {
  return path
    .relative(ROUTES_DIR, path.dirname(routePath))
    .replace(/\\/g, "/");
}

function isTopLevel(routePath) {
  const rel = relDir(routePath);
  return rel !== "" && !rel.includes("/") && !HYBRID_ROOTS.has(rel);
}

function isHybridRootLayout(routePath) {
  return HYBRID_ROOTS.has(relDir(routePath));
}

function isHybridDirectChild(routePath) {
  const rel = relDir(routePath);
  const parts = rel.split("/");
  return parts.length === 2 && HYBRID_ROOTS.has(parts[0]);
}

function targetPath(routePath) {
  const dir = path.dirname(routePath);
  const segment = path.basename(dir);

  if (segment === "_index") {
    return { dest: path.join(dir, "index.tsx"), mode: "index" };
  }

  if (isHybridRootLayout(routePath)) {
    return { dest: path.join(dir, "index.tsx"), mode: "hybrid-index" };
  }

  if (isTopLevel(routePath)) {
    return { dest: path.join(ROUTES_DIR, `${segment}.tsx`), mode: "top-level" };
  }

  if (isHybridDirectChild(routePath)) {
    return {
      dest: path.join(path.dirname(dir), `${segment}.tsx`),
      mode: "hybrid-layout",
    };
  }

  const childDirs = hasChildRouteDirs(dir);
  const hoistToParent = path.join(path.dirname(dir), `${segment}.route.tsx`);

  if (childDirs) {
    return { dest: hoistToParent, mode: "layout-sibling" };
  }

  return { dest: hoistToParent, mode: "nested-leaf" };
}

function updatePathMap(pathMap, oldFolderRel, newModuleRel) {
  const oldNorm = oldFolderRel.replace(/\\/g, "/");
  const newNorm = newModuleRel.replace(/\\/g, "/").replace(/\.tsx$/, "");
  for (const [flatId, folderPath] of Object.entries(pathMap)) {
    const fp = folderPath.replace(/\\/g, "/");
    if (fp === oldNorm || fp === `${oldNorm}/route`) {
      pathMap[flatId] = newNorm;
    }
  }
}

const opts = parseArgs();
const pathMap = fs.existsSync(PATH_MAP)
  ? JSON.parse(fs.readFileSync(PATH_MAP, "utf8"))
  : {};

let renamed = 0;
for (const routePath of findRouteModules()) {
  const { dest, mode } = targetPath(routePath);
  if (dest === routePath) continue;
  if (fs.existsSync(dest)) {
    console.warn(`skip (exists): ${path.relative(ROOT, dest)}`);
    continue;
  }

  const rel = path.relative(ROOT, routePath);
  const destRel = path.relative(ROOT, dest);

  if (opts.dryRun) {
    console.log(`[dry-run] ${rel} → ${destRel} (${mode})`);
    renamed++;
    continue;
  }

  fs.renameSync(routePath, dest);

  const dir = path.dirname(routePath);
  if (mode === "layout-sibling") {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) fs.rmdirSync(dir);
  } else if (
    mode === "hybrid-leaf" ||
    mode === "nested-leaf" ||
    mode === "top-level"
  ) {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) fs.rmdirSync(dir);
  }

  updatePathMap(
    pathMap,
    path.relative(ROUTES_DIR, dir),
    path.relative(ROUTES_DIR, dest),
  );

  console.log(`renamed: ${rel} → ${destRel} (${mode})`);
  renamed++;
}

if (!opts.dryRun && renamed > 0) {
  fs.writeFileSync(PATH_MAP, JSON.stringify(pathMap, null, 2) + "\n");
}

console.log(`${opts.dryRun ? "would rename" : "renamed"} ${renamed} route module(s)`);
