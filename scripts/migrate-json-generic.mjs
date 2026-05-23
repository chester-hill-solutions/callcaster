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
  if (!/\bjson\s*</.test(src)) continue;
  const orig = src;

  if (!/from ["']react-router["']/.test(src)) {
    if (/LoaderFunctionArgs|ActionFunctionArgs/.test(src)) {
      src = `import { data } from "react-router";\n${src}`;
    }
  } else {
    src = src.replace(
      /import\s+\{([^}]+)\}\s+from\s+["']react-router["']/,
      (match, imports) => {
        if (/\bdata\b/.test(imports)) return match;
        return `import { data, ${imports.trim()} } from "react-router"`;
      },
    );
  }

  src = src.replace(/\bjson\s*</g, "data<");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`updated ${changed} files`);
