#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

const pathMap = fs.existsSync(PATH_MAP)
  ? JSON.parse(fs.readFileSync(PATH_MAP, "utf8"))
  : {};

let changed = 0;
for (const file of walk(path.join(ROOT, "test"))) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const [flatId, folderPath] of Object.entries(pathMap)) {
    const target = folderPath.endsWith("/route")
      ? folderPath
      : `${folderPath}/route`;
    const oldPat = `../app/routes/${flatId}`;
    const newPat = `../app/routes/${target}`;
    if (!src.includes(newPat)) {
      src = src.split(oldPat).join(newPat);
    }
    const oldPat2 = `app/routes/${flatId}`;
    const newPat2 = `app/routes/${target}`;
    if (!src.includes(newPat2)) {
      src = src.split(oldPat2).join(newPat2);
    }
  }
  src = src.replace(/(\/route){2,}/g, "/route");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`updated ${changed} test files`);
