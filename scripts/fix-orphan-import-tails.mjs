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

function isTailLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^} from ["']/.test(t)) return true;
  if (/^type\s+\w+/.test(t)) return true;
  if (/^[\w$.*{]+\s*,?\s*$/.test(t)) return true;
  return false;
}

let fixed = 0;
for (const file of walk(ROUTES)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let i = 0;
  let changed = false;
  while (i < lines.length) {
    const line = lines[i];
    if (isTailLine(line) && !/^import\s*\{/.test(line)) {
      let start = i;
      while (start > 0 && isTailLine(lines[start - 1])) start--;
      const prev = out[out.length - 1] ?? "";
      if (!prev.trim().endsWith("{") && !/^import\s*\{/.test(prev)) {
        const block = lines.slice(start, i + 1);
        const close = block[block.length - 1];
        if (/^} from /.test(close.trim())) {
          out.push(`import {`);
          for (const b of block) out.push(b);
          i++;
          changed = true;
          continue;
        }
      }
    }
    out.push(line);
    i++;
  }
  if (changed) {
    fs.writeFileSync(file, out.join("\n"));
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`fixed ${fixed} files`);
