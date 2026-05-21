#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".server.tsx")) out.push(p);
  }
  return out;
}

function clientPath(serverPath) {
  return serverPath.replace(/\.server\.tsx$/, ".tsx");
}

function exportedHandlers(src) {
  const names = [];
  if (/^export\s+(const|async function)\s+loader\b/m.test(src)) names.push("loader");
  if (/^export\s+(const|async function)\s+action\b/m.test(src)) names.push("action");
  return names;
}

function isBrokenClient(src) {
  const trimmed = src.trim();
  if (!trimmed) return true;
  if (/^export\s*\{\s*$/.test(trimmed)) return true;
  if (trimmed.length < 40 && !/export default/.test(trimmed)) return true;
  if (/^export\s*\{\s*loader,\s*export\s*\{/.test(trimmed)) return true;
  return false;
}

let restored = 0;
let fixed = 0;

for (const serverPath of walk(ROUTES)) {
  const client = clientPath(serverPath);
  if (!fs.existsSync(client)) continue;

  const serverSrc = fs.readFileSync(serverPath, "utf8");
  const clientSrc = fs.readFileSync(client, "utf8");
  const handlers = exportedHandlers(serverSrc);
  if (handlers.length === 0) continue;

  const rel = `./${path.basename(serverPath).replace(/\.tsx$/, "")}`;
  const shim = `export { ${handlers.join(", ")} } from "${rel}";\n`;

  if (isBrokenClient(clientSrc)) {
    fs.writeFileSync(client, shim);
    restored++;
    console.log("restore:", path.relative(process.cwd(), client));
    continue;
  }

  if (
    clientSrc.includes('export { loader, export {') ||
    /^export\s*\{\s*loader,\s*export\s*\{/.test(clientSrc)
  ) {
    const extra = clientSrc.replace(/^export\s*\{[^;]+;\n?/, "");
    fs.writeFileSync(client, shim + extra);
    fixed++;
    console.log("fix-merge:", path.relative(process.cwd(), client));
  }
}

console.log(`restored ${restored}, fixed ${fixed}`);
