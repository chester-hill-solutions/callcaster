#!/usr/bin/env node
/**
 * RR7 strips loader/action from client route modules but keeps top-level imports.
 * `useLoaderData<typeof loader>()` / `useActionData<typeof action>()` prevent DCE,
 * pulling .server modules (e.g. database.server) into the client bundle.
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.join(process.cwd(), "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function hasTypeNamed(src, name) {
  return new RegExp(`\\b(type|interface)\\s+${name}\\b`).test(src);
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  if (hasTypeNamed(src, "LoaderData")) {
    src = src.replace(
      /useLoaderData\s*<\s*typeof\s+loader\s*>/g,
      "useLoaderData<LoaderData>",
    );
    src = src.replace(
      /useLoaderData\s*<\s*typeof\s+import\s*\([^)]+\)\.loader\s*>/g,
      "useLoaderData<LoaderData>",
    );
  } else {
    src = src.replace(/useLoaderData\s*<\s*typeof\s+loader\s*>/g, "useLoaderData");
    src = src.replace(
      /useLoaderData\s*<\s*typeof\s+import\s*\([^)]+\)\.loader\s*>/g,
      "useLoaderData",
    );
  }

  if (hasTypeNamed(src, "ActionData")) {
    src = src.replace(
      /useActionData\s*<\s*typeof\s+action\s*>/g,
      "useActionData<ActionData>",
    );
  } else {
    src = src.replace(/useActionData\s*<\s*typeof\s+action\s*>/g, "useActionData");
  }

  if (src !== orig) {
    fs.writeFileSync(file, src);
    return true;
  }
  return false;
}

let n = 0;
for (const file of walk(ROUTES)) {
  if (patchFile(file)) {
    n++;
    console.log(path.relative(process.cwd(), file));
  }
}
console.log(`patched ${n} route files`);
