#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let n = 0;
for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  const next = src
    .replace(/from ['"]\.\.\/lib\//g, "from '@/lib/")
    .replace(/from ['"]\.\.\/\.\.\/\.\.\/lib\//g, "from '@/lib/");
  if (next !== src) {
    fs.writeFileSync(file, next);
    n++;
  }
}
console.log(`fixed lib imports in ${n} files`);
