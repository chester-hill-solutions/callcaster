#!/usr/bin/env node
/**
 * Migrate route modules: extract loader/action to *.loader.server.ts / *.action.server.ts,
 * replace `await import()` with static imports, remove @ts-nocheck, thin re-export route.
 *
 * Usage: node scripts/bulk-migrate-route-server-modules.mjs [--dry-run] [glob...]
 * Default glob: app/routes/api+ (all ts/tsx except existing server modules)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !/\.(loader|action)\.server\.(tsx|ts)$/.test(ent.name))
      out.push(p);
  }
  return out;
}

function collectFiles() {
  if (args.length) return args.map((f) => path.resolve(ROOT, f));
  return walk(path.join(ROOT, "app/routes/api+"));
}

function collectAllRouteFiles() {
  return walk(path.join(ROOT, "app/routes"));
}

function baseName(routeFile) {
  const bn = path.basename(routeFile);
  return bn.replace(/\.route\.tsx$/, "").replace(/\.tsx$/, "").replace(/\.ts$/, "");
}

function dirName(routeFile) {
  return path.dirname(routeFile);
}

function parseAwaitImports(source) {
  const imports = new Map();
  const re = /const\s+\{([^}]+)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const mod = m[2];
    if (!imports.has(mod)) imports.set(mod, new Set());
    for (const n of names) imports.get(mod).add(n);
  }
  return imports;
}

function buildStaticImportLines(awaitImports) {
  const lines = [];
  for (const [mod, names] of awaitImports) {
    const sorted = [...names].sort();
    lines.push(`import { ${sorted.join(", ")} } from "${mod}";`);
  }
  return lines.sort().join("\n");
}

function stripAwaitImports(source) {
  return source.replace(
    /\s*const\s+\{[^}]+\}\s*=\s*await\s+import\s*\(\s*["'][^"']+["']\s*\)\s*;?\n?/g,
    "\n",
  );
}

function removeNocheck(source) {
  return source.replace(/^\/\/\s*@ts-nocheck\s*\n+/m, "");
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
  const isAsyncFn = after.startsWith(`export async function ${name}`);
  let bodyStart;
  if (isAsyncFn) {
    bodyStart = after.indexOf("{", after.indexOf(")"));
  } else {
    bodyStart = after.indexOf("=>");
    if (bodyStart < 0) return null;
    bodyStart = after.indexOf("{", bodyStart);
  }
  if (bodyStart < 0) return null;

  let depth = 0;
  let end = bodyStart;
  for (let i = bodyStart; i < after.length; i++) {
    const c = after[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  const chunk = after.slice(0, end);
  const header = isAsyncFn
    ? chunk.match(/^export async function \w+[^{]*/)?.[0]?.trim() + " "
    : `export const ${name} = `;
  const body = chunk.slice(chunk.indexOf("{"));
  return { header: isAsyncFn ? `export async function ${name}` : `export const ${name} =`, body, full: chunk };
}

function existingTopImports(source, exportStart) {
  const head = source.slice(0, exportStart);
  return head
    .split("\n")
    .filter((l) => /^import\s/.test(l.trim()))
    .join("\n");
}

function shouldSkip(file, source) {
  if (file.includes(".action.server.") || file.includes(".loader.server.")) return true;
  if (!source.includes("await import(")) return true;
  if (file.includes("/archive/") || file.includes("/old.")) return true;
  return false;
}

function migrateFile(routeFile) {
  let source = fs.readFileSync(routeFile, "utf8");
  if (!source.includes("await import(")) return { skipped: "no-dynamic" };

  if (shouldSkip(routeFile, source) === true) return { skipped: "server-module" };

  const hasDefault = source.includes("export default");
  source = removeNocheck(source);
  const loader = extractExport(source, "loader");
  const action = extractExport(source, "action");
  if (!loader && !action) return { skipped: "no-exports" };

  const dir = dirName(routeFile);
  const base = baseName(routeFile);

  const writes = [];
  const reexports = [];

  for (const [kind, exp] of [
    ["loader", loader],
    ["action", action],
  ]) {
    if (!exp) continue;
    const awaitImports = parseAwaitImports(exp.full);
    const staticFromAwait = buildStaticImportLines(awaitImports);
    const exportStart = source.indexOf(exp.full);
    const topImports = existingTopImports(source, exportStart);
    const body = stripAwaitImports(exp.full);
    const extraTypes = [];
    if (kind === "loader" && !topImports.includes("LoaderFunctionArgs")) {
      extraTypes.push('import type { LoaderFunctionArgs } from "react-router";');
    }
    if (kind === "action" && !topImports.includes("ActionFunctionArgs")) {
      extraTypes.push('import type { ActionFunctionArgs } from "react-router";');
    }

    const outFile = path.join(dir, `${base}.${kind}.server.ts`);
    const content = [
      topImports,
      staticFromAwait,
      ...extraTypes.filter((l) => !topImports.includes(l)),
      "",
      body.replace(
        /export const action = async \(\{ request \}: \{ request: Request \}\)/,
        "export const action = async ({ request }: ActionFunctionArgs)",
      ),
      "",
    ]
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");

    writes.push({ outFile, content });
    reexports.push(`export { ${kind} } from "./${base}.${kind}.server";`);
  }

  let routeContent;
  if (hasDefault) {
    let remaining = source;
    if (loader) remaining = remaining.replace(loader.full, "");
    if (action) remaining = remaining.replace(action.full, "");
    remaining = remaining.replace(/\n{3,}/g, "\n\n").trim();
    routeContent = `${reexports.join("\n")}\n\n${remaining}\n`;
  } else {
    routeContent = `${reexports.join("\n")}\n`;
  }

  if (dryRun) {
    return { dryRun: true, routeFile, writes: writes.map((w) => w.outFile) };
  }

  for (const w of writes) fs.writeFileSync(w.outFile, w.content);
  fs.writeFileSync(routeFile, routeContent);
  return { migrated: true, routeFile, writes: writes.map((w) => w.outFile) };
}

function main() {
  const files = args.length
    ? collectFiles()
    : collectAllRouteFiles().filter(
        (f) =>
          f.includes(`${path.sep}app${path.sep}routes${path.sep}`) &&
          !f.includes(`${path.sep}archive${path.sep}`) &&
          !path.basename(f).startsWith("old."),
      );
  const results = { migrated: [], skipped: [] };
  for (const f of files) {
    try {
      const r = migrateFile(f);
      if (r.migrated) results.migrated.push(r);
      else if (r.skipped) results.skipped.push({ file: path.relative(ROOT, f), reason: r.skipped });
    } catch (e) {
      results.skipped.push({ file: path.relative(ROOT, f), reason: String(e) });
    }
  }
  console.log(JSON.stringify({ dryRun, migrated: results.migrated.length, skipped: results.skipped.length }, null, 2));
  if (results.migrated.length) {
    console.log("Migrated:", results.migrated.map((r) => path.relative(ROOT, r.routeFile)).join(", "));
  }
}

main();
