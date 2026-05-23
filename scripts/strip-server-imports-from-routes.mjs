#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve("app/routes");
const SERVER_IMPORT =
  /^import\s+.*from\s+['"](@\/|~\/|\.\.?\/)[^'"]*\.server[^'"]*['"];?\s*$/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !/\.server\.(tsx|ts)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

for (const file of walk(ROUTES_DIR)) {
  const src = fs.readFileSync(file, "utf8");
  if (!SERVER_IMPORT.test(src)) continue;
  const lines = src.split("\n");
  const next = lines.filter((line) => !SERVER_IMPORT.test(line.trim()));
  if (next.length !== lines.length) {
    fs.writeFileSync(file, next.join("\n"));
    console.log("stripped:", path.relative(process.cwd(), file));
  }
}
