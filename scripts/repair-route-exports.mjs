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

let fixed = 0;
for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  // export { loader, import { action } from "./x.server";
  src = src.replace(
    /^export\s+\{\s*([^,}]+)\s*,\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+(["'][^"']+["'])\s*;?/gm,
    (_, first, rest, fromPath) => {
      const names = new Set(
        [...first.split(","), ...rest.split(",")].map((s) => s.trim()).filter(Boolean),
      );
      const list = [...names].join(", ");
      return `export { ${list} } from ${fromPath};\nimport { ${list} } from ${fromPath};`;
    },
  );

  // export { loader, export type { X } from "./x.server";
  src = src.replace(
    /^export\s+\{\s*([^,}]+)\s*,\s*export\s+type\s+\{([^}]+)\}\s+from\s+(["'][^"']+["'])\s*;?/gm,
    (_, value, types, fromPath) => {
      const v = value.trim();
      const t = types.trim();
      return `export { ${v} } from ${fromPath};\nexport type { ${t} } from ${fromPath};`;
    },
  );

  // orphan closing import fragment
  src = src.replace(/^ \} from ["']\.\/[^"']+\.server["'];\n/gm, "");

  // restore broken import { at start (missing opening)
  if (/^import\s*\{\s*$/m.test(src) === false) {
    src = src.replace(
      /^(\s*)(deriveWorkspaceAdminRows,)/m,
      "$1import {\n$1  $2",
    );
  }

  if (src !== orig) {
    fs.writeFileSync(file, src);
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`repaired ${fixed} files`);
