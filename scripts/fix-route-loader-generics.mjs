#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function hasTypeNamed(src, name) {
  return new RegExp(`\\b(type|interface)\\s+${name}\\b`).test(src);
}

for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  if (hasTypeNamed(src, "LoaderData")) {
    src = src.replace(/\buseLoaderData\(\)/g, "useLoaderData<LoaderData>()");
  }
  if (hasTypeNamed(src, "ActionData")) {
    src = src.replace(/\buseActionData\(\)/g, "useActionData<ActionData>()");
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    console.log(path.relative(process.cwd(), file));
  }
}
