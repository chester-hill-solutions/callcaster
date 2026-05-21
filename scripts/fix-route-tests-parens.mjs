#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function fixAsRouteResponseParens(src) {
  const marker = "asRouteResponse(";
  let out = "";
  let i = 0;

  while (i < src.length) {
    const start = src.indexOf(marker, i);
    if (start === -1) {
      out += src.slice(i);
      break;
    }

    out += src.slice(i, start + marker.length);
    let pos = start + marker.length;
    let depth = 1;

    while (pos < src.length && depth > 0) {
      const ch = src[pos];
      if (ch === "(") {
        depth++;
        out += ch;
        pos++;
        continue;
      }
      if (ch === ")") {
        depth--;
        out += ch;
        pos++;
        continue;
      }
      if (depth > 0 && (ch === ";" || ch === ",")) {
        out += ")";
        depth--;
        if (depth === 0) {
          out += ch;
          pos++;
          break;
        }
      }
      out += ch;
      pos++;
    }

    i = pos;
  }

  return out;
}

let changed = 0;
for (const file of walk(path.resolve("test"))) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("asRouteResponse(")) continue;
  const next = fixAsRouteResponseParens(src);
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`fixed ${changed} files`);
