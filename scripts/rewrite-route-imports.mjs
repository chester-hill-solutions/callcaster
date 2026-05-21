#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");
const ROUTES_DIR = path.join(ROOT, "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const pathMap = fs.existsSync(PATH_MAP)
  ? JSON.parse(fs.readFileSync(PATH_MAP, "utf8"))
  : {};

let changed = 0;
for (const file of walk(path.join(ROOT, "app"))) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const [flatId, folderPath] of Object.entries(pathMap)) {
    const patterns = [
      [`./${flatId}.server`, `./${path.relative(path.dirname(file), path.join(ROUTES_DIR, folderPath, "route.server")).replace(/\\/g, "/")}`],
      [`./${flatId}`, `./${path.relative(path.dirname(file), path.join(ROUTES_DIR, folderPath, "route")).replace(/\\/g, "/")}`],
      [`from "./${flatId}.server"`, `from "./${relRouteServer(file, folderPath)}"`],
      [`from './${flatId}.server'`, `from './${relRouteServer(file, folderPath)}'`],
      [`from "./${flatId}"`, `from "./${relRoute(file, folderPath)}"`],
    ];
    for (const [from, to] of patterns) {
      if (!to.startsWith("./")) continue;
      src = src.split(from).join(to);
    }
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
  }
}

function relRoute(fromFile, folderPath) {
  let rel = path.relative(path.dirname(fromFile), path.join(ROUTES_DIR, folderPath, "route")).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function relRouteServer(fromFile, folderPath) {
  let rel = path.relative(path.dirname(fromFile), path.join(ROUTES_DIR, folderPath, "route.server")).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

console.log(`rewrote imports in ${changed} app files`);
