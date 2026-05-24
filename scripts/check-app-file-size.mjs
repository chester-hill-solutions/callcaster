#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("app");
const MAX_LINES = 800;
const EXEMPT = new Set(["lib/database.types.ts"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

const offenders = [];
for (const file of await walk(ROOT)) {
  const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
  if (EXEMPT.has(rel.replace(/^app\//, ""))) continue;
  const content = await readFile(file, "utf8");
  const lines = content.split("\n").length;
  if (lines > MAX_LINES) {
    offenders.push({ rel, lines });
  }
}

if (offenders.length === 0) {
  console.log(`No app files exceed ${MAX_LINES} lines.`);
  process.exit(0);
}

offenders.sort((a, b) => b.lines - a.lines);
console.error(`Found ${offenders.length} app file(s) over ${MAX_LINES} lines:`);
for (const { rel, lines } of offenders) {
  console.error(`  ${lines}\t${rel}`);
}
process.exit(1);
