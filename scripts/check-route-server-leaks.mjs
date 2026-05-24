#!/usr/bin/env node
/** Fail if active route *.tsx files import server-only modules (pre-build guard). */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");

function isLegacy(rel) {
  return (
    rel.includes("/archive/") ||
    rel.startsWith("archive/") ||
    /\/old\./.test(rel) ||
    rel.startsWith("old.")
  );
}

function isThinReexportOnly(source) {
  const withoutComments = source.replace(/\/\/[^\n]*/g, "").trim();
  const lines = withoutComments.split("\n").filter((l) => l.trim());
  return lines.every((line) =>
    /^export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/.test(line.trim()),
  );
}

function stripAllowedServerImports(source) {
  return source
    .replace(/^import\s+type\s+[\s\S]*?from\s+["']@\/lib\/[^"']+\.server["'];?\s*$/gm, "")
    .replace(/^export\s+\{[\s\S]*?\}\s+from\s+["']@\/lib\/[^"']+\.server["'];?\s*$/gm, "")
    .replace(/^export\s+\{\s*(?:loader|action)\s*\}\s+from\s+["']\.\/[^"']+\.server["'];?\s*$/gm, "");
}

function hasServerLeak(source) {
  if (/\bawait\s+import\s*\(\s*["']@\/lib\/[^"']+\.server["']\s*\)/.test(source)) {
    return true;
  }
  const stripped = stripAllowedServerImports(source);
  if (/from\s+["']@\/lib\/[^"']+\.server["']/.test(stripped)) {
    return true;
  }
  return false;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(ROUTES)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (isLegacy(rel)) continue;

  const source = fs.readFileSync(file, "utf8");
  if (isThinReexportOnly(source)) continue;
  if (hasServerLeak(source)) hits.push(rel);
}

if (hits.length) {
  console.error("Active route modules must not import server-only code:\n");
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log("Route server leak check passed.");
