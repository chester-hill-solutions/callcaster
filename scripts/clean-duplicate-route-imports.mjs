#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROUTES = path.resolve("app/routes");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.tsx") out.push(p);
  }
  return out;
}

function stripOrphanTails(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = out[out.length - 1] ?? "";
    const isOrphanStart =
      /^\s+[\w$.*{]/.test(line) &&
      !/^import\s/.test(line.trim()) &&
      !prev.trim().endsWith("{") &&
      !/^import\s*\{/.test(prev);
    if (isOrphanStart) {
      while (i < lines.length) {
        if (/^import\s*\{/.test(lines[i])) break;
        if (/^} from /.test(lines[i].trim())) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out.push(line);
  }
  return out;
}

function dedupeImportBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^import\s*\{/.test(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const block = [];
    let j = i;
    while (j < lines.length) {
      block.push(lines[j]);
      if (/^} from /.test(lines[j].trim())) break;
      j++;
    }
    const fromLine = block[block.length - 1]?.trim() ?? "";
    const nextStartsAt = j + 1;
    if (
      nextStartsAt < lines.length &&
      /^import\s*\{/.test(lines[nextStartsAt]) &&
      lines.slice(nextStartsAt).find((l) => /^} from /.test(l.trim()))?.trim() === fromLine
    ) {
      i = nextStartsAt;
      while (i < lines.length) {
        const skip = [lines[i]];
        let k = i;
        while (k < lines.length && !/^} from /.test(lines[k].trim())) {
          k++;
          if (k < lines.length) skip.push(lines[k]);
        }
        if (k < lines.length) skip.push(lines[k]);
        out.push(...skip);
        i = k + 1;
        break;
      }
      continue;
    }
    out.push(...block);
    i = j + 1;
  }
  return out;
}

let fixed = 0;
for (const file of walk(ROUTES)) {
  const orig = fs.readFileSync(file, "utf8");
  let lines = orig.split("\n");
  const before = lines.join("\n");
  lines = stripOrphanTails(lines);
  lines = dedupeImportBlocks(lines);
  const after = lines.join("\n");
  if (after !== before) {
    fs.writeFileSync(file, after);
    fixed++;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`cleaned ${fixed} files`);
