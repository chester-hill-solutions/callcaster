#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const TEST_DIR = path.resolve("test");
const IMPORT = 'import { asRouteResponse } from "./helpers/route-result";\n';
const IMPORT_DEPTH = 'import { asRouteResponse } from "../helpers/route-result";\n';

const START_RE =
  /const\s+(\w+)\s*=\s*await\s+(?!asRouteResponse)((?:[\w.]+)\.(?:loader|action))\(/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function closeCallParen(src, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function wrapRouteCalls(src) {
  let out = "";
  let last = 0;
  START_RE.lastIndex = 0;
  let m;
  while ((m = START_RE.exec(src)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const close = closeCallParen(src, openParen);
    if (close < 0) continue;

    const fn = m[2];
    const call = src.slice(openParen, close);
    out += src.slice(last, m.index);
    out += `const ${m[1]} = await asRouteResponse(await ${fn}${call})`;
    last = close;
    START_RE.lastIndex = close;
  }
  out += src.slice(last);
  return out;
}

function addImport(file, src) {
  if (
    src.includes('from "./helpers/route-result"') ||
    src.includes('from "../helpers/route-result"')
  ) {
    return src;
  }
  const imp = file.includes(`${path.sep}ui${path.sep}`) ? IMPORT_DEPTH : IMPORT;
  const vitestIdx = src.indexOf('from "vitest"');
  if (vitestIdx < 0) return imp + src;
  const lineEnd = src.indexOf("\n", vitestIdx);
  return src.slice(0, lineEnd + 1) + "\n" + imp + src.slice(lineEnd + 1);
}

let changed = 0;
for (const file of walk(TEST_DIR)) {
  const src = fs.readFileSync(file, "utf8");
  if (!START_RE.test(src)) continue;
  START_RE.lastIndex = 0;

  let next = wrapRouteCalls(src);
  next = addImport(file, next);
  if (next === src) continue;

  fs.writeFileSync(file, next);
  changed++;
  console.log(path.relative(process.cwd(), file));
}

console.log(`updated ${changed} test files`);
