#!/usr/bin/env node
/** Remove // @ts-nocheck from route files (skip archive/ and old.*). */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "archive") continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(ent.name) && !path.basename(p).startsWith("old.")) {
      out.push(p);
    }
  }
  return out;
}

let n = 0;
for (const f of walk(path.join(ROOT, "app/routes"))) {
  let s = fs.readFileSync(f, "utf8");
  if (!/^\/\/\s*@ts-nocheck/m.test(s)) continue;
  s = s.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
  if (!dryRun) fs.writeFileSync(f, s);
  n++;
}
console.log(`${dryRun ? "[dry-run] " : ""}Removed @ts-nocheck from ${n} files`);
