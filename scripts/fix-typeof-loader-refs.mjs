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
for (const clientPath of walk(ROUTES)) {
  let src = fs.readFileSync(clientPath, "utf8");
  if (!/typeof\s+loader\b/.test(src) && !/typeof\s+action\b/.test(src)) continue;

  const exportMatch = src.match(
    /export\s+\{([^}]+)\}\s+from\s+["'](\.\/[^"']+\.server)["']/,
  );
  if (!exportMatch) continue;

  const names = exportMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const serverPath = exportMatch[2];
  const imports = names.filter(
    (n) =>
      new RegExp(`typeof\\s+${n}\\b`).test(src) &&
      !new RegExp(`import\\s+\\{[^}]*\\b${n}\\b`).test(src),
  );
  if (imports.length === 0) continue;

  const importLine = `import { ${imports.join(", ")} } from "${serverPath}";`;
  if (src.includes(importLine)) continue;

  const exportLine = exportMatch[0];
  const exportIdx = src.indexOf(exportLine);
  const afterExport = exportIdx + exportLine.length;
  src =
    src.slice(0, afterExport) +
    "\n" +
    importLine +
    src.slice(afterExport);
  fs.writeFileSync(clientPath, src);
  fixed++;
  console.log(path.relative(process.cwd(), clientPath));
}

console.log(`fixed ${fixed} routes`);
