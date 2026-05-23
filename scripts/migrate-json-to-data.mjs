#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") walk(p, out);
    else if (/\.(tsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk("app")) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  if (!/\bjson\b/.test(src)) continue;
  if (!/from ["']react-router["']/.test(src) && !/from ["']@remix-run\/node["']/.test(src)) {
    continue;
  }

  src = src.replace(/from ["']@remix-run\/node["']/g, 'from "react-router"');
  src = src.replace(
    /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/g,
    (match, imports) => {
      if (!/\bjson\b/.test(imports)) return match;
      const next = imports.replace(/\bjson\b/g, "data");
      return `import {${next}} from "react-router"`;
    },
  );
  src = src.replace(/\bjson\s*\(/g, "data(");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`updated ${changed} files`);
