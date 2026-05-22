#!/usr/bin/env node
/**
 * Move top-level route imports from `*.server` modules into loader/action bodies.
 * Skips names referenced outside loader/action (e.g. in default export).
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");
const IMPORT_LINE_RE =
  /^import\s+(type\s+)?(\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+\.server[^"']*)["'];?\s*$/gm;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseNamedImports(clause) {
  const inner = clause.replace(/^\{|\}$/g, "");
  return inner
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^type\s+(\w+)(?:\s+as\s+(\w+))?$/);
      if (m) return { imported: m[1], local: m[2] ?? m[1], isType: true };
      const m2 = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!m2) return null;
      return { imported: m2[1], local: m2[2] ?? m2[1], isType: false };
    })
    .filter(Boolean);
}

function splitClientServer(src) {
  const defaultIdx = src.search(/^export\s+default\b/m);
  const clientPart = defaultIdx >= 0 ? src.slice(defaultIdx) : "";
  const serverPart = defaultIdx >= 0 ? src.slice(0, defaultIdx) : src;
  return { clientPart, serverPart };
}

function injectIntoExports(src, modulePath, names) {
  const runtimeNames = names.filter((n) => !n.isType);
  if (runtimeNames.length === 0) return src;
  const destruct = runtimeNames.map((n) =>
    n.local === n.imported ? n.imported : `${n.imported}: ${n.local}`,
  );
  const stmt = `  const { ${destruct.join(", ")} } = await import("${modulePath}");\n`;

  for (const exportName of ["loader", "action"]) {
    const re = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${exportName}\\s*\\([^)]*\\)\\s*\\{`,
      "g",
    );
    src = src.replace(re, (m) => m + stmt);
    const re2 = new RegExp(
      `export\\s+const\\s+${exportName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
      "g",
    );
    src = src.replace(re2, (m) => m + stmt);
  }
  return src;
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  const imports = [...src.matchAll(IMPORT_LINE_RE)];
  if (imports.length === 0) return false;

  const { clientPart, serverPart } = splitClientServer(src);

  const byModule = new Map();
  for (const m of imports) {
    if (m[1]) continue; // type-only import line
    const modulePath = m[3];
    const names = parseNamedImports(m[2]);
    if (!byModule.has(modulePath)) byModule.set(modulePath, []);
    byModule.get(modulePath).push(...names);
  }

  for (const [modulePath, names] of byModule) {
    const usedInClient = names.filter(
      (n) => !n.isType && new RegExp(`\\b${n.local}\\b`).test(clientPart),
    );
    const usedInServer = names.filter(
      (n) => !n.isType && new RegExp(`\\b${n.local}\\b`).test(serverPart),
    );

    if (usedInClient.length > 0) {
      console.warn(
        `skip ${path.relative(process.cwd(), file)}: ${modulePath} used in UI: ${usedInClient.map((n) => n.local).join(", ")}`,
      );
      continue;
    }

    if (usedInServer.length === 0) continue;

    const lineRe = new RegExp(
      `^import\\s+(?:type\\s+)?\\{[^}]*\\}\\s+from\\s+["']${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?\\s*$`,
      "gm",
    );
    src = src.replace(lineRe, "");
    src = injectIntoExports(src, modulePath, usedInServer);
  }

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
console.log(`patched ${n} route files`);
