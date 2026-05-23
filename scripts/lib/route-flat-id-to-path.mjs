#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const ROUTES_DIR = path.join(ROOT, "app/routes");
const OVERRIDES_PATH = path.join(
  ROOT,
  "scripts/manifests/route-structure-overrides.json",
);

/** Top-level route roots that become hybrid folders (name+). */
const HYBRID_ROOTS = new Set([
  "workspaces",
  "api",
  "admin",
  "survey",
]);

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));
}

/**
 * Convert Remix flat route file id to nested folder path under app/routes.
 * @param {string} flatId e.g. workspaces_.$id_.settings_.numbers
 * @returns {string} relative path e.g. workspaces+/$id/settings/numbers
 */
export function flatIdToFolderPath(flatId, overrides = loadOverrides()) {
  if (overrides[flatId]) {
    return overrides[flatId].replace(/^\/+|\/+$/g, "");
  }

  const segments = flatId.split(".");
  const parts = [];

  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];

    // Trailing _ on segment: pathless layout break for params ($id_), or strip on static (surveys_)
    if (seg.endsWith("_")) {
      if (seg.startsWith("$") && seg.length > 2) {
        // $surveyId_ → folder $surveyId (pathless marker on param — still in URL)
        parts.push(seg.slice(0, -1));
        continue;
      }
      seg = seg.slice(0, -1);
      if (!seg) continue;
      if (seg.startsWith("$")) {
        parts.push(seg);
        continue;
      }
    }

    // Leading _ on first segment: pathless (e.g. _index)
    if (i === 0 && seg.startsWith("_")) {
      parts.push(seg);
      continue;
    }

    // Hybrid + only on the first URL segment (workspaces+, api+, admin+)
    if (i === 0) {
      const base = seg.replace(/_+$/, "");
      if (HYBRID_ROOTS.has(base)) {
        parts.push(`${base}+`);
        continue;
      }
      parts.push(seg);
      continue;
    }

    parts.push(seg);
  }

  return parts.join("/");
}

export function flatIdToDestDir(flatId, overrides) {
  return path.join(ROUTES_DIR, flatIdToFolderPath(flatId, overrides));
}

export function destDirToImportPath(destDir) {
  const rel = path.relative(path.join(ROOT, "app"), destDir).replace(/\\/g, "/");
  return `@/${rel}`;
}

export function flatImportPath(flatId) {
  return `app/routes/${flatId}`;
}

export function nestedImportPath(flatId, overrides, suffix = "route") {
  const folder = flatIdToFolderPath(flatId, overrides);
  return `app/routes/${folder}/${suffix}`;
}

if (process.argv[1]?.endsWith("route-flat-id-to-path.mjs")) {
  const overrides = loadOverrides();
  const args = process.argv.slice(2);
  if (args.includes("--print") && args.length > 1) {
    const id = args.find((a) => !a.startsWith("-"));
    if (id) console.log(flatIdToFolderPath(id, overrides));
  } else if (args.includes("--all")) {
    for (const ent of fs.readdirSync(ROUTES_DIR, { withFileTypes: true })) {
      if (!ent.isFile() || ent.name.includes(".server.")) continue;
      if (!/\.(tsx|ts|js)$/.test(ent.name)) continue;
      const flatId = ent.name.replace(/\.(tsx|ts|js)$/, "");
      console.log(`${flatId} -> ${flatIdToFolderPath(flatId, overrides)}`);
    }
  }
}
