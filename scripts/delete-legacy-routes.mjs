#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

const targets = [
  path.join(ROOT, "app/routes/archive"),
  path.join(ROOT, "app/lib/legacyRoute.server.ts"),
];

for (const ent of fs.readdirSync(path.join(ROOT, "app/routes"))) {
  if (ent.startsWith("old.")) {
    targets.push(path.join(ROOT, "app/routes", ent));
  }
}

for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  if (dryRun) console.log(`[dry-run] rm ${path.relative(ROOT, t)}`);
  else {
    fs.rmSync(t, { recursive: true, force: true });
    console.log(`removed ${path.relative(ROOT, t)}`);
  }
}
