#!/usr/bin/env node
/** Regenerate *.loader.server.ts / *.action.server.ts for one route from git ref. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const routeRel = process.argv[2];
const GIT_REF = process.argv.find((a) => a.startsWith("--ref="))?.slice(6) ?? "523129c^";

if (!routeRel) {
  console.error("Usage: node scripts/repair-one-route-server.mjs app/routes/api+/campaign-export.tsx");
  process.exit(1);
}

function gitShow(rel) {
  return execSync(`git show '${GIT_REF}:${rel.replace(/'/g, "'\\''")}'`, {
    cwd: ROOT,
    encoding: "utf8",
    shell: "/bin/bash",
  });
}

function removeNocheck(s) {
  return s.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
}

function parseAwaitImports(source) {
  const imports = new Map();
  const re = /const\s+\{([^}]+)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      if (!imports.has(m[2])) imports.set(m[2], new Set());
      imports.get(m[2]).add(n);
    }
  }
  return imports;
}

function staticLines(awaitImports) {
  return [...awaitImports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mod, names]) => {
      const parts = [...names].sort().map((n) => {
        const trimmed = n.trim();
        if (trimmed.includes(":")) return trimmed.replace(":", " as ");
        return trimmed;
      });
      return `import { ${parts.join(", ")} } from "${mod}";`;
    });
}

function stripAwait(source) {
  return source.replace(
    /\s*const\s+\{[^}]+\}\s*=\s*await\s+import\s*\(\s*["'][^"']+["']\s*\)\s*;?\n?/g,
    "\n",
  );
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
  const isAsyncFn = /^export async function/.test(after);
  const bodyStart = isAsyncFn
    ? after.indexOf("{", after.indexOf(")"))
    : after.indexOf("{", after.indexOf("=>"));
  if (bodyStart < 0) return null;
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

function findImportEnd(source) {
  const re = /^import(?:\s+type)?\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
  let end = 0;
  let m;
  while ((m = re.exec(source))) end = m.index + m[0].length;
  return end;
}

function isServerOnlyChunk(chunk) {
  if (!chunk.trim()) return false;
  if (/export default|export \{ RouteErrorBoundary/.test(chunk)) return false;
  if (/<\/[A-Za-z][^>]*>/.test(chunk)) return false;
  if (/return\s*\(\s*<[A-Z]/.test(chunk)) return false;
  if (/@\/components\/|@\/hooks\/|logger\.client|from ["']react["']|from ["']sonner["']/.test(chunk))
    return false;
  return /^(async )?function |^export (async )?function |^type |^interface |^const \w+ =|^export const \w+ =/m.test(
    chunk,
  );
}

function filterServerPreamble(text) {
  if (!text?.trim()) return "";
  const parts = text.split(/\n(?=(?:export )?(?:async )?function |type |interface |const \w+ =|export const \w+ =)/);
  return parts
    .map((p) => p.trim())
    .filter(isServerOnlyChunk)
    .join("\n\n");
}

function serverTail(source, fromIndex, untilIndex) {
  if (untilIndex <= fromIndex) return "";
  return filterServerPreamble(source.slice(fromIndex, untilIndex));
}

function typeOnlyImports(source) {
  const re = /import\s+type[\s\S]*?from\s+["'][^"']+["'];?/g;
  const types = [];
  let m;
  while ((m = re.exec(source))) types.push(m[0].trim());
  return types.join("\n");
}

function valueImportsFromSource(source) {
  const re = /^import\s+(?!type)[\s\S]*?from\s+["'][^"']+["'];?/gm;
  const values = [];
  let m;
  while ((m = re.exec(source))) {
    const stmt = m[0].trim();
    if (/@\/components\/|@\/hooks\/|from ["']react["']|from ["']sonner["']|logger\.client/.test(stmt))
      continue;
    values.push(stmt);
  }
  return values.join("\n");
}

function buildModule(source, kind, exp, helpers) {
  const raw = [helpers, exp.full].filter(Boolean).join("\n\n");
  const awaitImports = parseAwaitImports(raw);
  const chunk = stripAwait(raw);
  const typeImport =
    kind === "loader"
      ? 'import type { LoaderFunctionArgs } from "react-router";'
      : 'import type { ActionFunctionArgs } from "react-router";';
  const rrImport = chunk.includes("redirect")
    ? chunk.includes("routeData")
      ? 'import { data as routeData, redirect } from "react-router";'
      : 'import { redirect } from "react-router";'
    : chunk.includes("routeData")
      ? 'import { data as routeData } from "react-router";'
      : "";
  const originalTypes = typeOnlyImports(source);
  const originalValues = valueImportsFromSource(source);
  const lines = [
    ...new Set([originalTypes, originalValues, rrImport, typeImport, ...staticLines(awaitImports)].filter(Boolean)),
  ];
  return `${lines.join("\n")}\n\n${chunk.trim().replace(/^\s*;\s*$/gm, "")}\n`;
}

function regenerate(routeFile, source) {
  source = removeNocheck(source);
  const loader = extractExport(source, "loader");
  const action = extractExport(source, "action");
  const dir = path.dirname(routeFile);
  const base = path
    .basename(routeFile)
    .replace(/\.route\.tsx$/, "")
    .replace(/\.tsx$/, "")
    .replace(/\.ts$/, "");
  const importEnd = findImportEnd(source);
  const firstExportAt = Math.min(loader?.start ?? Infinity, action?.start ?? Infinity);
  const preExport = filterServerPreamble(
    firstExportAt > importEnd ? source.slice(importEnd, firstExportAt) : "",
  );
  const defaultIdx = source.indexOf("export default");

  if (loader) {
    const until = action?.start ?? (defaultIdx >= 0 ? defaultIdx : source.length);
    const post = serverTail(source, loader.end, until);
    fs.writeFileSync(
      path.join(dir, `${base}.loader.server.ts`),
      buildModule(source, "loader", loader, [preExport, post].filter(Boolean).join("\n\n")),
    );
  }
  if (action) {
    const post = serverTail(source, action.end, defaultIdx >= 0 ? defaultIdx : source.length);
    const actionHelpers = loader ? post : [preExport, post].filter(Boolean).join("\n\n");
    fs.writeFileSync(
      path.join(dir, `${base}.action.server.ts`),
      buildModule(source, "action", action, actionHelpers),
    );
  }
}

const routeFile = path.join(ROOT, routeRel);
const source = gitShow(routeRel);
regenerate(routeFile, source);
console.log(`Repaired server modules for ${routeRel} (ref ${GIT_REF})`);
