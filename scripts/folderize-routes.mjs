#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  flatIdToDestDir,
  flatIdToFolderPath,
} from "./lib/route-flat-id-to-path.mjs";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app/routes");
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, manifest: null, batch: null, only: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--manifest" && args[i + 1]) opts.manifest = args[++i];
    else if (args[i] === "--batch" && args[i + 1]) opts.batch = Number(args[++i]);
    else if (args[i] === "--only" && args[i + 1]) opts.only = args[++i].split(",");
  }
  return opts;
}

function loadFlatIds(opts) {
  if (opts.only) return opts.only.map((s) => s.trim()).filter(Boolean);
  if (!opts.manifest) {
    console.error("Provide --manifest or --only");
    process.exit(1);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, opts.manifest), "utf8"),
  );
  const batches = manifest.batches ?? manifest;
  if (Array.isArray(batches)) {
    if (opts.batch == null) {
      console.error("Provide --batch N with manifest batches");
      process.exit(1);
    }
    return batches[opts.batch] ?? [];
  }
  return manifest.flatIds ?? [];
}

function rewriteServerImports(content, flatId) {
  const escaped = flatId.replace(/\./g, "\\.");
  return content
    .replace(
      new RegExp(`from ["']\\.\\/${escaped}\\.server["']`, "g"),
      'from "./route.server"',
    )
    .replace(
      new RegExp(`from ["']\\.\\/${escaped}\\.server\\.tsx?["']`, "g"),
      'from "./route.server"',
    );
}

function folderizeOne(flatId, dryRun, pathMap) {
  const destDir = flatIdToDestDir(flatId);
  const destRoute = path.join(destDir, "route.tsx");
  const destServer = path.join(destDir, "route.server.tsx");

  const srcRoute = path.join(ROUTES_DIR, `${flatId}.tsx`);
  const srcServer = path.join(ROUTES_DIR, `${flatId}.server.tsx`);
  const srcServerTs = path.join(ROUTES_DIR, `${flatId}.server.ts`);
  const srcJs = path.join(ROUTES_DIR, `${flatId}.js`);

  if (fs.existsSync(destRoute)) {
    return { flatId, status: "skipped", reason: "dest exists" };
  }

  const hasRoute = fs.existsSync(srcRoute) || fs.existsSync(srcJs);
  const serverPath = fs.existsSync(srcServer)
    ? srcServer
    : fs.existsSync(srcServerTs)
      ? srcServerTs
      : null;

  if (!hasRoute && !serverPath) {
    return { flatId, status: "error", reason: "no source files" };
  }

  const folderPath = flatIdToFolderPath(flatId);
  pathMap[flatId] = folderPath;

  if (dryRun) {
    console.log(`[dry-run] ${flatId} -> ${folderPath}/`);
    return { flatId, status: "dry-run" };
  }

  fs.mkdirSync(destDir, { recursive: true });

  if (hasRoute) {
    const src = fs.existsSync(srcRoute) ? srcRoute : srcJs;
    let content = fs.readFileSync(src, "utf8");
    content = rewriteServerImports(content, flatId);
    fs.writeFileSync(destRoute, content);
    fs.unlinkSync(src);
  }

  if (serverPath) {
    fs.renameSync(serverPath, destServer);
  }

  return { flatId, status: "moved", folderPath };
}

function main() {
  const opts = parseArgs();
  const flatIds = loadFlatIds(opts);
  const pathMap = fs.existsSync(PATH_MAP)
    ? JSON.parse(fs.readFileSync(PATH_MAP, "utf8"))
    : {};

  const results = [];
  for (const flatId of flatIds) {
    results.push(folderizeOne(flatId, opts.dryRun, pathMap));
  }

  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(PATH_MAP), { recursive: true });
    fs.writeFileSync(PATH_MAP, JSON.stringify(pathMap, null, 2) + "\n");
  }

  const moved = results.filter((r) => r.status === "moved").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error");
  console.log(`folderize: moved=${moved} skipped=${skipped} errors=${errors.length}`);
  for (const e of errors) console.error(`  ${e.flatId}: ${e.reason}`);
  if (errors.length) process.exit(1);
}

main();
