#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx") && !ent.name.endsWith(".server.tsx")) {
      out.push(p);
    }
  }
  return out;
}

const SERVER_ONLY = new Set([
  "data",
  "redirect",
  "defer",
  "json",
  "LoaderFunctionArgs",
  "ActionFunctionArgs",
]);

let fixed = 0;
for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  if (!/from ["']react-router["']/.test(src)) continue;
  const body = src.replace(/^import[\s\S]*?^export /m, "").replace(/^import[\s\S]*?^function /m, "");
  const orig = src;

  src = src.replace(
    /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/g,
    (m, imports) => {
      const parts = imports.split(",").map((s) => s.trim());
      const kept = parts.filter((p) => {
        const name = p.replace(/^type\s+/, "");
        if (!SERVER_ONLY.has(name)) return true;
        const re = new RegExp(`\\b${name}\\s*\\(`);
        return re.test(src);
      });
      if (kept.length === 0) return "";
      if (kept.length === parts.length) return m;
      return `import { ${kept.join(", ")} } from "react-router"`;
    },
  );

  if (src !== orig) {
    fs.writeFileSync(file, src);
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`stripped ${fixed} client routes`);
