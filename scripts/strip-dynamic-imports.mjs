#!/usr/bin/env node
/** Replace all `await import()` with static top-level imports; remove @ts-nocheck. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "archive" || ent.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(ent.name) && !path.basename(p).startsWith("old.")) {
      out.push(p);
    }
  }
  return out;
}

function parseAwaitImports(source) {
  const imports = new Map();
  const re = /const\s+\{([^}]+)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const mod = m[2];
    if (!imports.has(mod)) imports.set(mod, new Set());
    for (const n of names) imports.get(mod).add(n);
  }
  return imports;
}

function processFile(file) {
  let source = fs.readFileSync(file, "utf8");
  if (!source.includes("await import(")) return false;

  const awaitImports = parseAwaitImports(source);
  const newImportLines = [];
  for (const [mod, names] of [...awaitImports.entries()].sort()) {
    const sorted = [...names].sort();
    const line = `import { ${sorted.join(", ")} } from "${mod}";`;
    if (!source.includes(line)) newImportLines.push(line);
  }

  source = source.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
  source = source.replace(
    /\s*const\s+\{[^}]+\}\s*=\s*await\s+import\s*\(\s*["'][^"']+["']\s*\)\s*;?\n?/g,
    "\n",
  );

  const firstImport = source.search(/^import\s/m);
  if (firstImport >= 0 && newImportLines.length) {
    source =
      source.slice(0, firstImport) +
      newImportLines.join("\n") +
      "\n" +
      source.slice(firstImport);
  } else if (newImportLines.length) {
    source = newImportLines.join("\n") + "\n\n" + source;
  }

  if (!dryRun) fs.writeFileSync(file, source);
  return true;
}

const files =
  targets.length > 0
    ? targets.flatMap((f) => {
        const p = path.resolve(ROOT, f);
        return fs.statSync(p).isDirectory() ? walk(p) : [p];
      })
    : walk(path.join(ROOT, "app/routes"));

let n = 0;
for (const f of files) {
  if (processFile(f)) n++;
}
console.log(`${dryRun ? "[dry-run] " : ""}Processed ${n} files with await import()`);
