#!/usr/bin/env node
/** Regenerate *.loader.server.ts / *.action.server.ts from git HEAD (minimal imports). */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const GIT_REF = process.argv.find((a) => a.startsWith("--ref="))?.slice(6) ?? "523129c^";

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

function findRouteForServer(serverFile) {
  const dir = path.dirname(serverFile);
  const base = path.basename(serverFile).replace(/\.(loader|action)\.server\.ts$/, "");
  for (const name of [`${base}.route.tsx`, `${base}.tsx`, `${base}.ts`]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function routeRel(f) {
  return path.relative(ROOT, f).split(path.sep).join("/");
}

function extractImports(source) {
  const re = /^import(?:\s+type)?\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
  const imports = [];
  let m;
  while ((m = re.exec(source))) imports.push(m[0].trim());
  return imports.join("\n");
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
  const parts = text.split(/\n(?=(?:export )?(?:async )?function |type |interface |const \w+ =)/);
  return parts
    .map((p) => p.trim())
    .filter(isServerOnlyChunk)
    .join("\n\n");
}

function serverOnlyBlock(text) {
  return filterServerPreamble(text);
}

function serverTail(source, fromIndex, untilIndex) {
  if (untilIndex <= fromIndex) return "";
  return serverOnlyBlock(source.slice(fromIndex, untilIndex));
}

function typeOnlyImports(source) {
  const all = extractImports(source);
  const types = [];
  const re = /import\s+type[\s\S]*?from\s+["'][^"']+["'];?/g;
  let m;
  while ((m = re.exec(all))) types.push(m[0].trim());
  return types.join("\n");
}

function valueImportsFromSource(source) {
  const all = extractImports(source);
  const values = [];
  const re = /^import\s+(?!type)[\s\S]*?from\s+["'][^"']+["'];?/gm;
  let m;
  while ((m = re.exec(all))) {
    const stmt = m[0].trim();
    if (
      /@\/components\/|@\/hooks\/|from ["']react["']|from ["']sonner["']|logger\.client/.test(
        stmt,
      )
    ) {
      continue;
    }
    values.push(
      stmt.replace(
        /from ["']@\/routes\/api\+\/token["']/,
        'from "@/routes/api+/token.loader.server"',
      ),
    );
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
    ...new Set(
      [originalTypes, originalValues, rrImport, typeImport, ...staticLines(awaitImports)].filter(
        Boolean,
      ),
    ),
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
  const preExport = serverOnlyBlock(
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
    const post = serverTail(
      source,
      action.end,
      defaultIdx >= 0 ? defaultIdx : source.length,
    );
    const actionHelpers = loader ? post : [preExport, post].filter(Boolean).join("\n\n");
    fs.writeFileSync(
      path.join(dir, `${base}.action.server.ts`),
      buildModule(source, "action", action, actionHelpers),
    );
  }
}

const skip = new Set([
  "app/routes/accept-invite.tsx",
  "app/routes/api+/campaign_queue.tsx",
]);
const serverFiles = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(loader|action)\.server\.ts$/.test(e.name)) serverFiles.push(p);
  }
}
walk(path.join(ROOT, "app/routes"));

const routes = new Set();
for (const sf of serverFiles) {
  const route = findRouteForServer(sf);
  if (route) routes.add(route);
}

let n = 0;
for (const routeFile of routes) {
  const rel = routeRel(routeFile);
  if (skip.has(rel)) continue;
  const source = gitShow(rel);
  if (!source) continue;
  regenerate(routeFile, source);
  n++;
}
console.log(`Regenerated server modules for ${n} routes (ref ${GIT_REF})`);
