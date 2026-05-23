#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");
const ROUTES = path.join(ROOT, "app/routes");

const SERVER_MODULE_RE =
  /from ["']@\/lib\/(database|supabase|logger|messaging-onboarding|rcs-onboarding)[^"']*\.server["']|from ["'][^"']*\.server["']/;

const targets = process.argv.slice(2);
const pathMap = JSON.parse(fs.readFileSync(PATH_MAP, "utf8"));

function gitFlat(flatId) {
  try {
    return execSync(`git show 'HEAD:app/routes/${flatId}.tsx'`, { encoding: "utf8" });
  } catch {
    return null;
  }
}

function parseImportBlocks(lines, end) {
  const blocks = [];
  let i = 0;
  while (i < end) {
    const line = lines[i];
    if (line.startsWith("import ") || line.startsWith("import{")) {
      const block = [line];
      i++;
      while (i < end && !block[block.length - 1].includes(";")) {
        block.push(lines[i]);
        i++;
      }
      blocks.push(block.join("\n"));
      continue;
    }
    if (
      /^(export\s+)?(interface|type)\s/.test(line) ||
      line.startsWith("export type ") ||
      line.startsWith("export interface ")
    ) {
      const block = [line];
      i++;
      while (i < end && lines[i].trim() && !lines[i].startsWith("import ")) {
        block.push(lines[i]);
        i++;
      }
      blocks.push(block.join("\n"));
      continue;
    }
    if (line.trim() === "" || line.trim().startsWith("//")) {
      i++;
      continue;
    }
    break;
  }
  return { blocks, next: i };
}

function remixToRouter(block) {
  return block
    .replace(/@remix-run\/node/g, "react-router")
    .replace(/@remix-run\/react/g, "react-router")
    .replace(/from ["']\.\/api\.([^"']+)["']/g, 'from "./../../../api+/$1/route"');
}

function restore(flatId, folderPath) {
  const raw = gitFlat(flatId);
  if (!raw) return false;

  const lines = raw.split("\n");
  const loaderIdx = lines.findIndex(
    (l) =>
      /^export\s+(async\s+)?function\s+loader\b/.test(l) ||
      /^export\s+const\s+loader\b/.test(l),
  );
  const actionBeforeDefault = lines.findIndex(
    (l) =>
      /^export\s+(async\s+)?function\s+action\b/.test(l) ||
      /^export\s+const\s+action\b/.test(l),
  );
  const headerEnd =
    loaderIdx >= 0
      ? loaderIdx
      : actionBeforeDefault >= 0
        ? actionBeforeDefault
        : -1;
  const defaultIdx = lines.findIndex((l) => /^export\s+default\b/.test(l));
  if (headerEnd < 0 || defaultIdx < 0) return false;

  const { blocks } = parseImportBlocks(lines, headerEnd);
  const clientBlocks = blocks
    .filter((b) => b.startsWith("import "))
    .filter((b) => !SERVER_MODULE_RE.test(b))
    .map(remixToRouter);

  const typeBlocks = blocks.filter((b) => !b.startsWith("import "));

  const serverPath = path.join(ROUTES, folderPath, "route.server.tsx");
  const serverSrc = fs.existsSync(serverPath)
    ? fs.readFileSync(serverPath, "utf8")
    : "";
  const exports = [];
  if (/export\s+((async\s+)?function|const)\s+loader\b/.test(serverSrc)) exports.push("loader");
  if (/export\s+(async\s+function|function|const)\s+action\b/.test(serverSrc))
    exports.push("action");
  if (exports.length === 0) return false;

  const shim = `export { ${exports.join(", ")} } from "./route.server";\n\n`;
  const body = lines.slice(defaultIdx).join("\n");
  const out = `${shim}${clientBlocks.join("\n")}\n\n${typeBlocks.join("\n\n")}\n\n${body}\n`;
  fs.writeFileSync(path.join(ROUTES, folderPath, "route.tsx"), out);
  return true;
}

let n = 0;
const entries = targets.length
  ? targets.map((t) => [t, pathMap[t] ?? t])
  : Object.entries(pathMap);

for (const [flatId, folderPath] of entries) {
  if (restore(flatId, folderPath)) {
    n++;
    console.log(folderPath);
  }
}

console.log(`restored ${n} routes`);
