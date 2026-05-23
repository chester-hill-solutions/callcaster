#!/usr/bin/env node
/* eslint-env node */
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  if (!/@remix-run/.test(src)) continue;

  src = src.replace(/@remix-run\/node/g, "react-router");
  src = src.replace(/@remix-run\/react/g, "react-router");
  src = src.replace(/\bjson\s*\(/g, "data(");
  src = src.replace(/\bdefer\s*\(/g, "data(");
  src = src.replace(
    /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/g,
    (m, imports) => {
      const parts = imports
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "json" && s !== "defer");
      return `import { ${parts.join(", ")} } from "react-router"`;
    },
  );

  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`updated ${changed} route file(s)`);
