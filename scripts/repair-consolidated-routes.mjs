#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");

const BROKEN_RE =
  /import \{\s*\nimport |import type \{\s*\nimport |^import \{\s*$/m;

function gitFlat(flatId) {
  try {
    return execSync(`git show 'HEAD:app/routes/${flatId}.tsx'`, {
      encoding: "utf8",
    });
  } catch {
    return null;
  }
}

function toRouter(src) {
  return src
    .replace(/@remix-run\/node/g, "react-router")
    .replace(/@remix-run\/react/g, "react-router")
    .replace(/\bjson\(/g, "data(")
    .replace(/\bdefer\(/g, "data(");
}

const pathMap = JSON.parse(fs.readFileSync(PATH_MAP, "utf8"));
const folderToFlat = Object.fromEntries(
  Object.entries(pathMap).map(([flatId, folder]) => [folder, flatId]),
);

let repaired = 0;
for (const [folder, flatId] of Object.entries(folderToFlat)) {
  const routePath = path.join(ROUTES, folder, "route.tsx");
  if (!fs.existsSync(routePath)) continue;
  const src = fs.readFileSync(routePath, "utf8");
  if (!BROKEN_RE.test(src)) continue;

  const raw = gitFlat(flatId);
  if (!raw) {
    console.warn(`no git source for ${flatId}`);
    continue;
  }

  fs.writeFileSync(routePath, toRouter(raw).replace(/^;\n/, ""));
  console.log(`repaired: ${folder}`);
  repaired++;
}

console.log(`repaired ${repaired} route(s)`);
