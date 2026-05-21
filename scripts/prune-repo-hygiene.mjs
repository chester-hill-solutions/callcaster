#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

const toDelete = [
  "all_files.txt",
  "app/lib/services/api.ts",
  "app/lib/startConferenceAndDial.js",
];

for (const rel of toDelete) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  if (dryRun) console.log(`[dry-run] rm ${rel}`);
  else {
    fs.unlinkSync(p);
    console.log(`deleted ${rel}`);
  }
}

const testFile = path.join(ROOT, "test/services-api.test.ts");
if (fs.existsSync(testFile)) {
  let src = fs.readFileSync(testFile, "utf8");
  src = src.replace(/@\/lib\/services\/api/g, "@/lib/services/hooks-api");
  src = src.replace(/path: "@\/lib\/services\/api"/g, 'path: "@/lib/services/hooks-api"');
  if (!dryRun) fs.writeFileSync(testFile, src);
}

if (process.argv.includes("--docs-banner")) {
  const notesDir = path.join(ROOT, "docs/archive/root-notes");
  const banner = "> **Historical only** — notes may not match the current codebase.\n\n";
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".md")) {
        let c = fs.readFileSync(p, "utf8");
        if (c.startsWith("> **Historical only**")) continue;
        if (!dryRun) fs.writeFileSync(p, banner + c);
        console.log(`banner ${path.relative(ROOT, p)}`);
      }
    }
  }
  if (fs.existsSync(notesDir)) walk(notesDir);
}
