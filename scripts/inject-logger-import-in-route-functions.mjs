#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");
const LOGGER_IMPORT =
  '  const { logger } = await import("@/lib/logger.server");\n';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function patchFunctionBody(body) {
  if (!/\blogger\./.test(body)) return body;
  if (/import\s*\(\s*["']@\/lib\/logger\.server["']\s*\)/.test(body.slice(0, 400))) {
    return body;
  }
  return LOGGER_IMPORT + body;
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  if (!/\blogger\./.test(src)) return false;
  const orig = src;

  // export async function name(...) {
  src = src.replace(
    /(export\s+async\s+function\s+\w+\s*\([^)]*\)\s*\{)/g,
    (m) => m,
  );
  src = src.replace(
    /(export\s+async\s+function\s+\w+\s*\([^)]*\)\s*\{)([\s\S]*?)(?=\nexport\s|\nasync function|\nfunction |\nconst |\Z)/g,
    (full, head, body) => head + patchFunctionBody(body),
  );

  // export const name = async (...) => {
  src = src.replace(
    /(export\s+const\s+\w+\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)([\s\S]*?)(?=\nexport\s|\nasync function|\nfunction |\nconst |\Z)/g,
    (full, head, body) => head + patchFunctionBody(body),
  );

  // async function name(...) {  (module helpers)
  src = src.replace(
    /(^async\s+function\s+\w+\s*\([^)]*\)\s*\{)/gm,
    (m, offset) => {
      return m;
    },
  );
  src = src.replace(
    /(^async\s+function\s+\w+\s*\([^)]*\)\s*\{)([\s\S]*?)(?=\nexport\s|\nasync function|\nfunction |\nconst |\Z)/gm,
    (full, head, body) => head + patchFunctionBody(body),
  );

  if (src !== orig) {
    fs.writeFileSync(file, src);
    return true;
  }
  return false;
}

let n = 0;
for (const file of walk(ROUTES)) {
  if (patchFile(file)) {
    n++;
    console.log(path.relative(process.cwd(), file));
  }
}
console.log(`patched ${n}`);
