#!/usr/bin/env node
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

function exportsFrom(src) {
  const names = [];
  if (/export\s+(const|async\s+function)\s+loader\b/.test(src)) names.push("loader");
  if (/export\s+(const|async\s+function)\s+action\b/.test(src)) names.push("action");
  return names;
}

for (const routePath of walk(ROUTES_DIR)) {
  const src = fs.readFileSync(routePath, "utf8");
  if (!hasServerImport(src) || hasDefaultExport(src)) continue;

  const serverPath = serverModulePath(routePath);
  const importPath = relativeImport(routePath, serverPath);
  const exported = exportsFrom(src);

  if (exported.length === 0) {
    console.log("skip (no loader/action):", path.relative(process.cwd(), routePath));
    continue;
  }

  if (!fs.existsSync(serverPath)) {
    fs.writeFileSync(serverPath, `${src.trim()}\n`);
  }

  const shim = `export { ${exported.join(", ")} } from "${importPath}";\n`;
  if (src.trim() !== shim.trim()) {
    fs.writeFileSync(routePath, shim);
    console.log("api-split:", path.relative(process.cwd(), routePath));
  }
}
