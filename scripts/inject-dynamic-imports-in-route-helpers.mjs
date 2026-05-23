#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function collectDynamicImports(src) {
  const byModule = new Map();
  const re =
    /const\s*\{([^}]+)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    const mod = m[2];
    if (!byModule.has(mod)) byModule.set(mod, new Map());
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p) continue;
      const alias = p.match(/^(\w+)\s*:\s*(\w+)$/);
      if (alias) byModule.get(mod).set(alias[2], alias[1]);
      else byModule.get(mod).set(p, p);
    }
  }
  return byModule;
}

function buildImportStmt(mod, locals) {
  const destruct = [...locals.entries()].map(([local, imported]) =>
    local === imported ? imported : `${imported}: ${local}`,
  );
  return `  const { ${destruct.join(", ")} } = await import("${mod}");\n`;
}

const FN_RE =
  /(export\s+async\s+function\s+(\w+)|export\s+const\s+(\w+)\s*=\s*async|(?:^|\n)async\s+function\s+(\w+)|(?:^|\n)const\s+(\w+)\s*=\s*async)\s*\([\s\S]*?\)\s*(?::\s*[\s\S]*?)?\s*(?:=>\s*)?\{/g;

function extractBody(src, openIdx) {
  let depth = 1;
  let i = openIdx;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return src.slice(openIdx, i);
}

function hasImportForSymbol(bodyPrefix, local) {
  if (new RegExp(`const\\s*\\{[^}]*\\b${local}\\b[^}]*\\}\\s*=\\s*await\\s+import`).test(bodyPrefix)) {
    return true;
  }
  return false;
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  const byModule = collectDynamicImports(src);
  if (byModule.size === 0) return false;

  const defaultIdx = src.search(/^export\s+default\b/m);
  const serverEnd = defaultIdx >= 0 ? defaultIdx : src.length;

  const inserts = [];

  FN_RE.lastIndex = 0;
  let m;
  while ((m = FN_RE.exec(src)) !== null) {
    const name = m[2] || m[3] || m[4] || m[5] || "";
    if (name === "loader" || name === "action") continue;
    if (m.index >= serverEnd) continue;

    const openBrace = m.index + m[0].length;
    const body = extractBody(src, openBrace);
    const bodyPrefix = body.slice(0, 600);

    const needed = new Map();
    for (const [mod, locals] of byModule) {
      const missing = new Map();
      for (const [local, imported] of locals) {
        if (!new RegExp(`\\b${local}\\b`).test(body)) continue;
        if (hasImportForSymbol(bodyPrefix, local)) continue;
        missing.set(local, imported);
      }
      if (missing.size > 0) needed.set(mod, missing);
    }

    if (needed.size === 0) continue;

    let injection = "";
    for (const [mod, missing] of needed) {
      injection += buildImportStmt(mod, missing);
    }
    inserts.push({ at: openBrace, text: injection });
  }

  if (inserts.length === 0) return false;

  inserts.sort((a, b) => b.at - a.at);
  for (const { at, text } of inserts) {
    src = src.slice(0, at) + text + src.slice(at);
  }
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
