#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const IMPORT = 'import { asRouteResponse } from "./helpers/route-result";\n';
const IMPORT_DEPTH = 'import { asRouteResponse } from "../helpers/route-result";\n';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

let fixed = 0;
for (const file of walk(path.resolve("test"))) {
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("asRouteResponse(")) continue;
  if (
    src.includes('from "./helpers/route-result"') ||
    src.includes('from "../helpers/route-result"')
  ) {
    continue;
  }

  const imp = file.includes(`${path.sep}ui${path.sep}`) ? IMPORT_DEPTH : IMPORT;
  const vitestIdx = src.indexOf('from "vitest"');
  if (vitestIdx >= 0) {
    const lineEnd = src.indexOf("\n", vitestIdx);
    src = src.slice(0, lineEnd + 1) + "\n" + imp + src.slice(lineEnd + 1);
  } else {
    src = imp + src;
  }

  fs.writeFileSync(file, src);
  fixed++;
  console.log(path.relative(process.cwd(), file));
}

console.log(`added imports to ${fixed} files`);
