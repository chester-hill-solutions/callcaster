#!/usr/bin/env node
/** Restore type/interface/const preamble stripped from route UI during server-module split. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const GIT_REF = process.argv.find((a) => a.startsWith("--ref="))?.slice(6) ?? "523129c^";
const dryRun = process.argv.includes("--dry-run");

function gitShow(rel) {
  try {
    return execSync(`git show '${GIT_REF}:${rel.replace(/'/g, "'\\''")}'`, {
      cwd: ROOT,
      encoding: "utf8",
      shell: "/bin/bash",
    });
  } catch {
    return null;
  }
}

function findImportEnd(source) {
  const re = /^import(?:\s+type)?\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$|^export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/gm;
  let end = 0;
  let m;
  while ((m = re.exec(source))) end = m.index + m[0].length;
  return end;
}

function findFirstExport(source) {
  const re = /^export\s+(?:const\s+(?:loader|action)\s*=|async\s+function\s+(?:loader|action)\s*\(|default\s+)/m;
  const m = source.match(re);
  return m?.index ?? -1;
}

function extractPreamble(source) {
  const cleaned = source.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
  const importEnd = findImportEnd(cleaned);
  const firstExport = findFirstExport(cleaned);
  if (firstExport <= importEnd) return "";
  const block = cleaned.slice(importEnd, firstExport).trim();
  return block
    .split(/\n(?=^(?:export )?type |^interface |^enum )/m)
    .map((part) => part.trim())
    .filter((part) => /^(?:export )?type |^interface |^enum /.test(part))
    .join("\n\n");
}

function hasPreambleTypes(source) {
  return /^(?:type|interface|const|enum)\s+\w+/m.test(source);
}

function insertPreamble(routeFile, preamble) {
  if (!preamble) return false;
  let source = fs.readFileSync(routeFile, "utf8");
  if (hasPreambleTypes(source)) return false;

  const reexportEnd = source.search(/\n\nimport/m);
  const importStart = reexportEnd >= 0 ? reexportEnd + 2 : 0;
  const importEnd = importStart + findImportEnd(source.slice(importStart));
  const before = source.slice(0, importEnd).trimEnd();
  const after = source.slice(importEnd).replace(/^\s*;\s*\n(?:\s*;\s*\n)*/m, "\n");
  const next = `${before}\n\n${preamble}\n${after.startsWith("\n") ? after : `\n${after}`}`;
  if (next === source) return false;
  if (!dryRun) fs.writeFileSync(routeFile, next);
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

const skip = new Set([
  "app/routes/accept-invite.tsx",
  "app/routes/api+/audience-upload.tsx",
  "app/routes/api+/campaign-export.tsx",
  "app/routes/api+/sms.tsx",
  "app/routes/api+/workspace.tsx",
  "app/routes/api+/auto-dial/dialer.route.tsx",
]);
let n = 0;
for (const f of walk(path.join(ROOT, "app/routes"))) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  if (skip.has(rel)) continue;
  const cur = fs.readFileSync(f, "utf8");
  if (!cur.includes("export { loader }") && !cur.includes("export { action }")) continue;
  const historical = gitShow(rel);
  if (!historical) continue;
  const preamble = extractPreamble(historical);
  if (insertPreamble(f, preamble)) n++;
}
console.log(`${dryRun ? "[dry-run] " : ""}Restored preamble on ${n} route UI files (ref ${GIT_REF})`);
