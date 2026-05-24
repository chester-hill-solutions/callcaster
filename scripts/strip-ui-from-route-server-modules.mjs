#!/usr/bin/env node
/** Remove UI/hook code that leaked before export in route *.server.ts modules. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(loader|action)\.server\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function hasUiLeak(source) {
  return /\buse(?:Effect|State|Callback|Ref|Fetcher|Memo)\b/.test(source);
}

function stripUiLeak(source) {
  const exportMatch = source.match(
    /^export\s+(?:const\s+(?:loader|action)|async\s+function\s+(?:loader|action))/m,
  );
  if (!exportMatch?.index) return source;

  const head = source.slice(0, exportMatch.index);
  const tail = source.slice(exportMatch.index);
  if (!hasUiLeak(head)) return source;

  const importEnd = head.search(/^(?:export |async function |function |type |interface |const \w)/m);
  const imports =
    importEnd > 0
      ? head.slice(0, importEnd).trim()
      : head.match(/^import[\s\S]*?(?=\n\n|\n(?=export ))/)?.[0]?.trim() ?? "";

  return (imports ? imports + "\n\n" : "") + tail.trim() + "\n";
}

let n = 0;
for (const f of walk(path.join(ROOT, "app/routes"))) {
  const source = fs.readFileSync(f, "utf8");
  if (!hasUiLeak(source)) continue;
  const next = stripUiLeak(source);
  if (next === source) continue;
  if (!dryRun) fs.writeFileSync(f, next);
  n++;
  console.log(path.relative(ROOT, f));
}
console.log(`${dryRun ? "[dry-run] " : ""}Stripped UI from ${n} server modules`);
