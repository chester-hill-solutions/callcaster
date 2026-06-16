#!/usr/bin/env node
/** Add shared imports removed when scrubbing client component re-exports from *.server.ts */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

const RULES = [
  {
    uses: /\bMemberRole\b/,
    import: 'import { MemberRole } from "@/lib/member-role";',
    has: /from\s+["']@\/lib\/member-role["']/,
  },
  {
    uses: /\blogger\b/,
    import: 'import { logger } from "@/lib/logger.server";',
    has: /from\s+["']@\/lib\/logger\.server["']/,
  },
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(loader|action)\.server\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function fixFile(file) {
  let source = fs.readFileSync(file, "utf8");
  const toAdd = RULES.filter((r) => r.uses.test(source) && !r.has.test(source)).map((r) => r.import);
  if (!toAdd.length) return false;

  const importBlockEnd = findImportBlockEnd(source);
  const lines = source.split("\n");
  lines.splice(importBlockEnd, 0, ...toAdd.sort());
  const next = lines.join("\n");
  if (next === source) return false;
  if (!dryRun) fs.writeFileSync(file, next);
  return true;
}

function findImportBlockEnd(source) {
  const lines = source.split("\n");
  let inImport = false;
  let lastImportLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^import\s/.test(line) || (inImport && line.trim())) {
      inImport = /^import\s/.test(line) || inImport;
      if (/from\s+["'][^"']+["'];?\s*$/.test(line.trim())) {
        lastImportLine = i + 1;
        inImport = false;
      }
    } else if (lastImportLine > 0 && line.trim() !== "") {
      break;
    }
  }
  return lastImportLine;
}

let n = 0;
for (const f of walk(path.join(ROOT, "app/routes"))) {
  if (fixFile(f)) n++;
}
console.log(`${dryRun ? "[dry-run] " : ""}Fixed imports on ${n} server modules`);
