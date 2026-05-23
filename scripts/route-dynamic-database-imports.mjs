#!/usr/bin/env node
/**
 * Move top-level `@/lib/database.server` imports into loader/action bodies so
 * the client route bundle does not resolve the database barrel.
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");
const IMPORT_RE =
  /^import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/database\.server["'];?\s*$/gm;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseNames(importBlock) {
  return importBlock
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!m) return null;
      return { imported: m[1], local: m[2] ?? m[1] };
    })
    .filter(Boolean);
}

function injectDynamicImport(body, names) {
  const destruct = names.map((n) =>
    n.local === n.imported ? n.imported : `${n.imported}: ${n.local}`,
  );
  const stmt = `  const { ${destruct.join(", ")} } = await import("@/lib/database.server");\n`;
  if (body.includes(stmt.trim())) return body;
  return stmt + body;
}

function patchExports(src, names, exportName) {
  const re = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
    "g",
  );
  return src.replace(re, (match) => match + injectDynamicImport("", names));
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  const matches = [...src.matchAll(IMPORT_RE)];
  if (matches.length === 0) return false;

  const names = matches.flatMap((m) => parseNames(m[1]));
  if (names.length === 0) return false;

  src = src.replace(IMPORT_RE, "");

  if (/export\s+const\s+loader\s*=/.test(src)) {
    src = patchExports(src, names, "loader");
  }
  if (/export\s+const\s+action\s*=/.test(src)) {
    src = patchExports(src, names, "action");
  }

  // Helpers used only from loader/action: inject into each export const loader/action
  // and top-level async function blocks that reference imported names — skip for now.

  fs.writeFileSync(file, src);
  return true;
}

let n = 0;
for (const file of walk(ROUTES)) {
  if (patchFile(file)) {
    n++;
    console.log(path.relative(process.cwd(), file));
  }
}
console.log(`patched ${n} files`);
