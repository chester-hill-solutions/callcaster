#!/usr/bin/env node
/* eslint-env node */
/**
 * Merge route.tsx + route.server.tsx into a single route.tsx (RR7 splits client/server).
 * Inverse of split-route-server-modules-v2.mjs.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app/routes");
const ROUTE_SERVER_RE = /^\.\/route\.server(?:\.tsx?)?$/;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, only: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--only" && args[i + 1]) {
      opts.only = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return opts;
}

function findPairs() {
  const pairs = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === "route.server.tsx") {
        const client = path.join(dir, "route.tsx");
        if (fs.existsSync(client)) pairs.push({ client, server: p });
      }
    }
  }
  walk(ROUTES_DIR);
  return pairs;
}

function matchesOnly(rel, onlyList) {
  if (!onlyList?.length) return true;
  return onlyList.some((pat) => {
    if (pat.includes("*")) {
      const re = new RegExp(
        "^" + pat.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
      );
      return re.test(rel);
    }
    return rel.includes(pat);
  });
}

function isRouteServerImport(line) {
  return ROUTE_SERVER_RE.test(
    (line.match(/from\s+['"]([^'"]+)['"]/) ?? [])[1] ?? "",
  );
}

/** Remove re-exports and imports from ./route.server */
function stripClientShims(src) {
  const lines = src.split("\n");
  const out = [];
  let skipUntilFrom = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (skipUntilFrom) {
      if (/from\s+['"]\.\/route\.server/.test(line)) skipUntilFrom = false;
      continue;
    }

    if (
      /^export\s+(type\s+)?\{/.test(trimmed) &&
      !/from\s+['"]\.\/route\.server/.test(line)
    ) {
      skipUntilFrom = true;
      continue;
    }

    if (
      (/^export\s+/.test(trimmed) || /^export\s+type\s+/.test(trimmed)) &&
      isRouteServerImport(line)
    ) {
      continue;
    }

    if (/^import\s+/.test(trimmed) && isRouteServerImport(line)) {
      continue;
    }

    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function partitionSource(src) {
  const lines = src.split("\n");
  const imports = [];
  const body = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("import ") || trimmed.startsWith("import{")) {
      const block = [line];
      i++;
      while (i < lines.length && !block[block.length - 1].includes(";")) {
        block.push(lines[i]);
        i++;
      }
      imports.push(block.join("\n"));
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("//")) {
      i++;
      continue;
    }
    break;
  }

  while (i < lines.length) {
    body.push(lines[i]);
    i++;
  }

  return {
    imports,
    body: body.join("\n").trim(),
  };
}

function dedupeImports(importLines) {
  const seen = new Set();
  const out = [];
  for (const line of importLines) {
    const key = line.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function consolidatePair({ client, server }, dryRun) {
  const serverSrc = fs.readFileSync(server, "utf8");
  const clientRaw = fs.readFileSync(client, "utf8");
  const clientStripped = stripClientShims(clientRaw);

  const serverPart = partitionSource(serverSrc);
  const clientPart = partitionSource(clientStripped);

  const mergedImports = dedupeImports([
    ...serverPart.imports,
    ...clientPart.imports,
  ]);

  const blocks = [];
  if (mergedImports.length) blocks.push(mergedImports.join("\n"));
  if (serverPart.body) blocks.push(serverPart.body);
  if (clientPart.body) blocks.push(clientPart.body);

  const merged = blocks.filter(Boolean).join("\n\n") + "\n";

  if (dryRun) {
    console.log(`[dry-run] ${path.relative(ROOT, client)}`);
    return true;
  }

  fs.writeFileSync(client, merged);
  fs.unlinkSync(server);
  console.log(`consolidated: ${path.relative(ROOT, client)}`);
  return true;
}

const opts = parseArgs();
const pairs = findPairs().filter(({ client }) =>
  matchesOnly(path.relative(ROOT, client), opts.only),
);

let count = 0;
for (const pair of pairs) {
  if (consolidatePair(pair, opts.dryRun)) count++;
}

console.log(
  `${opts.dryRun ? "would consolidate" : "consolidated"} ${count} route module(s)`,
);
