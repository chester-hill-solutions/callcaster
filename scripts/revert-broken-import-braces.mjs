#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx") && !ent.name.endsWith(".server.tsx")) {
      out.push(p);
    }
  }
  return out;
}

function isImportContinuation(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith("//")) return true;
  if (/^import\s/.test(t)) return false;
  if (t.includes(" from ")) return true;
  if (/^type\s+\w+/.test(t)) return true;
  if (/^[\w$]+\s*(,|\})/.test(t)) return true;
  if (t === "}" || t === "};") return true;
  return false;
}

let fixed = 0;
for (const file of walk(ROUTES)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let changed = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "import {") {
      let j = i + 1;
      let valid = true;
      while (j < lines.length && isImportContinuation(lines[j])) {
        if (lines[j].includes(" from ")) break;
        j++;
      }
      const block = lines.slice(i, j);
      const hasFrom = block.some((l) => l.includes(" from "));
      if (!hasFrom) {
        changed = true;
        continue;
      }
    }
    out.push(line);
  }
  const next = out.join("\n").replace(/\n{3,}/g, "\n\n");
  if (changed) {
    fs.writeFileSync(file, next);
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`reverted ${fixed} files`);
