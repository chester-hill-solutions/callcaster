#!/usr/bin/env node
/** Remove client-only imports and duplicate import lines from route *.server.ts modules. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");

const CLIENT_IMPORT =
  /^import\s+(?!type).*from\s+["'](?:react|sonner|lucide-react|@\/components\/|@\/hooks\/)/;
const CLIENT_HOOK =
  /^import\s+\{[^}]*\b(use(?:ActionData|LoaderData|Navigation|Navigate|Effect|State|Memo|Callback|Ref|Fetcher|Revalidator|SearchParams|OutletContext))\b/;
const CLIENT_LOGGER = /logger\.client/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(loader|action)\.server\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function parseImportStatements(source) {
  const re = /^import(?:\s+type)?\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
  const stmts = [];
  let m;
  while ((m = re.exec(source))) stmts.push(m[0].trim());
  return stmts;
}

function isClientImport(stmt) {
  if (CLIENT_IMPORT.test(stmt)) return true;
  if (CLIENT_HOOK.test(stmt)) return true;
  if (CLIENT_LOGGER.test(stmt)) return true;
  if (/from\s+["']react["']/.test(stmt) && !/^import\s+type/.test(stmt)) return true;
  return false;
}

function dedupeImports(stmts) {
  const bySource = new Map();
  for (const stmt of stmts) {
    const from = stmt.match(/from\s+["']([^"']+)["']/)?.[1];
    if (!from) continue;
    if (!bySource.has(from)) bySource.set(from, stmt);
    else {
      const existing = bySource.get(from);
      if (stmt.length > existing.length) bySource.set(from, stmt);
    }
  }
  return [...bySource.values()].sort((a, b) => a.localeCompare(b));
}

function ensureRouterImports(source) {
  const usesRouteData = /\brouteData\b/.test(source);
  const usesRedirect = /\bredirect\b/.test(source);
  const hasTypeLoader = /LoaderFunctionArgs/.test(source);
  const hasTypeAction = /ActionFunctionArgs/.test(source);
  const lines = [];

  const valueNames = [];
  if (usesRouteData) valueNames.push("data as routeData");
  if (usesRedirect) valueNames.push("redirect");
  if (valueNames.length) {
    lines.push(`import { ${valueNames.join(", ")} } from "react-router";`);
  }
  if (hasTypeLoader && !source.includes('import type { LoaderFunctionArgs')) {
    lines.push('import type { LoaderFunctionArgs } from "react-router";');
  }
  if (hasTypeAction && !source.includes('import type { ActionFunctionArgs')) {
    lines.push('import type { ActionFunctionArgs } from "react-router";');
  }
  return lines;
}

function scrubFile(file) {
  let source = fs.readFileSync(file, "utf8");
  const imports = parseImportStatements(source);
  const kept = dedupeImports(imports.filter((s) => !isClientImport(s)));
  const bodyStart = source.search(/^(?:export |async function |function |type |interface |const \w)/m);
  let body =
    bodyStart >= 0
      ? source.slice(bodyStart)
      : source.replace(/^import[\s\S]*?(?:\n\n|\n(?=export ))/, "");

  body = body.replace(/^\s*;\s*$/gm, "").replace(/\n{3,}/g, "\n\n");

  const routerLines = ensureRouterImports(body);
  const filtered = kept.filter(
    (s) =>
      !/^import\s+\{[^}]*\}\s+from\s+["']react-router["']/.test(s) &&
      !/^import\s+type\s+\{[^}]*\}\s+from\s+["']react-router["']/.test(s),
  );
  const allImports = [...routerLines, ...filtered].sort((a, b) => a.localeCompare(b));

  const next = (allImports.length ? allImports.join("\n") + "\n\n" : "") + body.trim() + "\n";
  if (next === source) return false;
  if (!dryRun) fs.writeFileSync(file, next);
  return true;
}

let n = 0;
for (const f of walk(path.join(ROOT, "app/routes"))) {
  if (scrubFile(f)) n++;
}
console.log(`${dryRun ? "[dry-run] " : ""}Scrubbed ${n} server modules`);
