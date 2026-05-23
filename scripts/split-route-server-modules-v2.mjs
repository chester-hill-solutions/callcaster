#!/usr/bin/env node
/* eslint-env node */

import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve("app/routes");
const SERVER_IMPORT =
  /from\s+['"](@\/|~\/|\.\.?\/)[^'"]*\.server[^'"]*['"]|from\s+['"]@\/twilio\.server['"]/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !/\.server\.(tsx|ts)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function hasDefaultExport(src) {
  return /export\s+default\s/.test(src);
}

function hasServerImport(src) {
  return SERVER_IMPORT.test(src);
}

function serverModulePath(routePath) {
  const parsed = path.parse(routePath);
  return path.join(parsed.dir, `${parsed.name}.server${parsed.ext}`);
}

function relativeImport(from, to) {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.(tsx|ts)$/, "");
}

for (const routePath of walk(ROUTES_DIR)) {
  const src = fs.readFileSync(routePath, "utf8");
  if (!hasServerImport(src) || !hasDefaultExport(src)) continue;

  const serverPath = serverModulePath(routePath);
  if (fs.existsSync(serverPath)) continue;

  const defaultIdx = src.search(/export\s+default\s+/);
  if (defaultIdx === -1) continue;

  const serverPart = src.slice(0, defaultIdx).trim();
  const clientPart = src.slice(defaultIdx).trim();

  const importPath = relativeImport(routePath, serverPath);
  const loaderActionReexports = [];
  if (/export\s+(const|async\s+function)\s+loader\b/.test(serverPart)) {
    loaderActionReexports.push("loader");
  }
  if (/export\s+(const|async\s+function)\s+action\b/.test(serverPart)) {
    loaderActionReexports.push("action");
  }

  const clientImports = clientPart
    .split("\n")
    .filter((line) => line.startsWith("import "))
    .filter((line) => !SERVER_IMPORT.test(line))
    .join("\n");

  const clientBody = clientPart
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .join("\n");

  const shim =
    (loaderActionReexports.length
      ? `export { ${loaderActionReexports.join(", ")} } from "${importPath}";\n\n`
      : "") +
    (clientImports ? `${clientImports}\n\n` : "") +
    `import { ${loaderActionReexports.join(", ")} } from "${importPath}";\n\n` +
    clientBody;

  fs.writeFileSync(serverPath, `${serverPart}\n`);
  fs.writeFileSync(routePath, `${shim.trim()}\n`);
  console.log(`v2-split: ${path.relative(process.cwd(), routePath)}`);
}
