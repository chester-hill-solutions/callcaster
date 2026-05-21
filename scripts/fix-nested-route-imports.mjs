#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.tsx" || ent.name === "route.ts")
      out.push(p);
  }
  return out;
}

let n = 0;
for (const file of walk(ROUTES)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  src = src.replace(
    /from ["']\.\/[^"']*route_[^"']*\.server["']/g,
    'from "./route.server"',
  );
  src = src.replace(
    /from ["']\.\/[^"']*route_[^"']*["']/g,
    (match) => {
      if (match.includes(".server")) return match;
      return 'from "./route.server"';
    },
  );
  // Fix cross-route: numbers purchase importing numbers flat path
  const dir = path.dirname(file);
  if (file.includes("settings/numbers/purchase")) {
    src = src.replace(
      /from ["']\.\/[^"']*settings[^"']*numbers["']/g,
      'from "../route"',
    );
    src = src.replace(
      /FetcherData[^;]*from ["'][^"']+["']/,
      'FetcherData } from "../route.server"',
    );
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    n++;
  }
}

console.log(`fixed ${n} route files`);
