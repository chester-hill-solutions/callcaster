#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function patchTsconfig() {
  const p = path.join(ROOT, "tsconfig.json");
  let src = fs.readFileSync(p, "utf8");
  src = src.replace(/\s*"app\/routes\/archive\/\*\*",?\n/g, "\n");
  src = src.replace(/\s*"app\/routes\/old\.\*",?\n/g, "\n");
  fs.writeFileSync(p, src);
  console.log("patched tsconfig.json");
}

for (const file of ["vitest.node.config.ts", "vitest.ui.config.ts"]) {
  let src = fs.readFileSync(path.join(ROOT, file), "utf8");
  src = src.replace(
    /"app\/routes\/api\*\.\{ts,tsx,js,jsx\}"/g,
    '"app/routes/**/*.{ts,tsx,js,jsx}"',
  );
  src = src.replace(/\s*"app\/routes\/archive\/\*\*",?\n/g, "\n");
  src = src.replace(/\s*"app\/routes\/old\.\*",?\n/g, "\n");
  fs.writeFileSync(path.join(ROOT, file), src);
  console.log(`patched ${file}`);
}

patchTsconfig();
