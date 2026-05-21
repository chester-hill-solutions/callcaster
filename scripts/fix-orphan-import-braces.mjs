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

let fixed = 0;
for (const file of walk(ROUTES)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s+\w+/.test(line) || line.includes("from ")) continue;
    const prev = lines[i - 1] ?? "";
    if (prev.startsWith("import {") || prev.startsWith("import{")) continue;
    if (prev.trim().endsWith(",") || /^\s+\w+/.test(prev)) continue;
    if (!/^import /.test(prev) && !prev.trim().endsWith("{")) {
      lines.splice(i, 0, "import {");
      changed = true;
      i++;
    }
  }
  lines.filter((l, idx) => !(l.trim() === ";" && idx < 15));
  const next = lines.join("\n").replace(/^\n;/m, "\n");
  if (changed) {
    fs.writeFileSync(file, next);
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`fixed ${fixed}`);
