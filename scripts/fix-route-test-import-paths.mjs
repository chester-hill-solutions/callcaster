#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, "test");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(TEST_DIR)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  src = src.replace(/(\/route){2,}/g, "/route");
  src = src.replace(
    /app\/routes\/workspaces\+\/route\+\/route\+\/route\+\/route_\.(\$id\.[^"']+)/g,
    "app/routes/workspaces+/$1/route",
  );
  src = src.replace(
    /app\/routes\/admin\+\/route\+\/route\+\/route\+\/route/g,
    "app/routes/admin+/route",
  );
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`fixed ${changed} test files`);
