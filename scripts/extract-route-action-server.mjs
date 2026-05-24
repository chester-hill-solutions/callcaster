#!/usr/bin/env node
/**
 * Scaffold *.action.server.ts from a route module that uses dynamic await import()
 * in loader/action. Run with --dry-run first.
 *
 * Usage:
 *   node scripts/extract-route-action-server.mjs --file app/routes/api+/foo.route.tsx
 *   node scripts/extract-route-action-server.mjs --dry-run --glob "app/routes/api+/**/*.tsx"
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--file" && args[i + 1]) opts.file = path.resolve(ROOT, args[++i]);
  }
  return opts;
}

function actionServerPath(routeFile) {
  const dir = path.dirname(routeFile);
  const base = path.basename(routeFile).replace(/\.route\.tsx$/, "").replace(/\.tsx$/, "");
  return path.join(dir, `${base}.action.server.ts`);
}

function patchRouteReexport(routeFile, baseName) {
  return `export { action } from "./${baseName}.action.server";\n`;
}

function main() {
  const { dryRun, file } = parseArgs();
  if (!file || !fs.existsSync(file)) {
    console.error("Provide --file path to an existing route module");
    process.exit(1);
  }
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("export const action")) {
    console.error("No export const action in", file);
    process.exit(1);
  }
  const out = actionServerPath(file);
  const baseName = path.basename(out, ".action.server.ts");
  console.log(dryRun ? "[dry-run]" : "Would create", path.relative(ROOT, out));
  console.log("Then replace route with:", patchRouteReexport(file, baseName));
  console.log(
    "\nManual step: move action body + convert await import() to static imports at top of .action.server.ts",
  );
}

main();
