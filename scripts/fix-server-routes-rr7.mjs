#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".server.tsx") || ent.name.endsWith(".server.ts")) {
      out.push(p);
    }
  }
  return out;
}

let jsonFixed = 0;
let shadowFixed = 0;

for (const file of walk(path.resolve("app/routes"))) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  if (/\bjson\(/.test(src)) {
    if (!/from ["']react-router["']/.test(src) && /LoaderFunctionArgs|ActionFunctionArgs/.test(src)) {
      src = `import { data, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";\n\n${src}`;
    }
    src = src.replace(/\bjson\(/g, "data(");
    jsonFixed++;
  }

  // Avoid shadowing react-router `data` helper with form payload locals
  if (/import\s+\{[^}]*\bdata\b[^}]*\}\s+from\s+["']react-router["']/.test(src)) {
    src = src.replace(
      /const\s+data\s*=\s*Object\.fromEntries\(formData\)/g,
      "const formPayload = Object.fromEntries(formData)",
    );
    src = src.replace(/data\["/g, 'formPayload["');
    src = src.replace(/data\.contact_id/g, "formPayload.contact_id");
    if (src !== orig) shadowFixed++;
  }

  if (src !== orig) fs.writeFileSync(file, src);
}

console.log(`json->data touches: ${jsonFixed}, shadow fixes: ${shadowFixed}`);
