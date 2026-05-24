#!/usr/bin/env node
/** Restore route UI from git HEAD; keep loader/action re-exports to *.server.ts */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

function gitShow(rel) {
  try {
    return execSync(`git show 'HEAD:${rel.replace(/'/g, "'\\''")}'`, {
      cwd: ROOT,
      encoding: "utf8",
      shell: "/bin/bash",
    });
  } catch {
    return null;
  }
}

function removeNocheck(s) {
  return s.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
}

function findImportEnd(source) {
  const re = /^import(?:\s+type)?\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
  let end = 0;
  let m;
  while ((m = re.exec(source))) end = m.index + m[0].length;
  return end;
}

function extractExport(source, name) {
  const patterns = [
    new RegExp(`export\\s+const\\s+${name}\\s*=`, "m"),
    new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`, "m"),
  ];
  let start = -1;
  for (const re of patterns) {
    const m = source.match(re);
    if (m?.index != null) {
      start = m.index;
      break;
    }
  }
  if (start < 0) return null;
  const after = source.slice(start);
  const bodyStart = /^export async function/.test(after)
    ? after.indexOf("{", after.indexOf(")"))
    : after.indexOf("{", after.indexOf("=>"));
  let depth = 0;
  let end = bodyStart;
  for (let i = bodyStart; i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return { start, end: start + end, full: after.slice(0, end) };
}

function rebuildRoute(routeFile) {
  const rel = path.relative(ROOT, routeFile).split(path.sep).join("/");
  const source = gitShow(rel);
  if (!source || !source.includes("export default")) return false;

  const cleaned = removeNocheck(source);
  const loader = extractExport(cleaned, "loader");
  const action = extractExport(cleaned, "action");
  if (!loader && !action) return false;

  const dir = path.dirname(routeFile);
  const base = path
    .basename(routeFile)
    .replace(/\.route\.tsx$/, "")
    .replace(/\.tsx$/, "")
    .replace(/\.ts$/, "");

  const reexports = [];
  if (loader) reexports.push(`export { loader } from "./${base}.loader.server";`);
  if (action) reexports.push(`export { action } from "./${base}.action.server";`);

  let ui = cleaned;
  if (loader) ui = ui.replace(loader.full, "");
  if (action) ui = ui.replace(action.full, "");

  const importEnd = findImportEnd(ui);
  const imports = ui.slice(0, importEnd).trim();
  const tail = ui.slice(importEnd).trim();

  const content = `${reexports.join("\n")}\n\n${imports}\n\n${tail}\n`;
  fs.writeFileSync(routeFile, content);
  return true;
}

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.(loader|action)\.server\.(tsx|ts)$/.test(e.name))
      out.push(p);
  }
  return out;
}

let n = 0;
const skip = new Set(["app/routes/accept-invite.tsx"]);
for (const f of walk(path.join(ROOT, "app/routes"))) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  if (skip.has(rel)) continue;
  const s = fs.readFileSync(f, "utf8");
  if (!s.includes("export { loader }") && !s.includes("export { action }")) continue;
  if (rebuildRoute(f)) n++;
}
console.log(`Rebuilt ${n} route UI files`);
