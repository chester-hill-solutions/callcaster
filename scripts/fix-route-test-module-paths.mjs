#!/usr/bin/env node
/* eslint-env node */
/**
 * Point test dynamic imports at actual route module paths (hybrid .tsx / *.route.tsx).
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");
const PATH_MAP = path.join(ROOT, "scripts/manifests/path-map.json");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function resolveModuleImportPath(folderPath) {
  const base = path.join(ROUTES, folderPath);
  const checks = [
    [`${base}.route.tsx`, folderPath],
    [`${base}.tsx`, folderPath],
    [`${base}.ts`, folderPath],
    [path.join(base, "index.tsx"), folderPath],
    [path.join(base, "route.tsx"), `${folderPath}/route`],
  ];
  for (const [file, imp] of checks) {
    if (fs.existsSync(file)) return imp;
  }
  return folderPath.endsWith(".route") ? folderPath : `${folderPath}/route`;
}

function normalizeRel(rel) {
  let r = rel.replace(/workspaces\+\+\+/g, "workspaces+");
  r = r.replace(
    /workspaces\+\+\/\$id\/campaigns\/\$selected\/id/g,
    "workspaces+/$id/campaigns/$selected_id",
  );
  r = r.replace(/admin\+_\.workspaces/, "admin+/workspaces");
  r = r.replace(/admin\+_\./, "admin+/");
  r = r.replace(/admin\+\/route(\/route\+)+/g, "admin+/route");
  r = r.replace(
    /admin\+\/route.*workspaces\.\$workspaceId\.(\w+)/,
    "admin+/workspaces/$workspaceId/$1.route",
  );
  r = r.replace(/\/route(\/route)+/g, "");
  if (r === "admin+") return "admin+/route";
  if (r.endsWith("/route")) r = r.slice(0, -"/route".length);
  return r;
}

function demangle(rel) {
  const rules = [
    [/^api\+\/call\/route-status-poll$/, "api+/call-status-poll"],
    [/^api\+\/call\/route-status$/, "api+/call-status"],
    [/^api\+\/call\/routeer-id\.status$/, "api+/caller-id/status.route"],
    [/^api\+\/call\/routeer-id$/, "api+/caller-id"],
    [/^api\+\/campaign-export\/route-status$/, "api+/campaign-export-status"],
    [/^api\+\/audience-upload\/route-status$/, "api+/audience-upload-status"],
    [/^api\+\/inbound\/route-sms$/, "api+/inbound-sms"],
    [/^api\+\/inbound\/route-verification$/, "api+/inbound-verification"],
    [/^api\+\/sms\/route\.status$/, "api+/sms/status.route"],
    [/^api\+\/workspace\/route-api-keys$/, "api+/workspace-api-keys"],
    [/^api\+\/campaigns\/route\.create-with-script$/, "api+/campaigns/create-with-script.route"],
    [/^api\+\/contact-audience\/route\.bulk-delete$/, "api+/contact-audience/bulk-delete.route"],
    [/^api\+\/auto-dial\/route\.\$(\w+)$/, "api+/auto-dial/$$$1.route"],
    [/^api\+\/auto-dial\/route\.(\w+)$/, "api+/auto-dial/$1.route"],
    [/^api\+\/dial\/route\.\$(\w+)$/, "api+/dial/$$$1.route"],
    [/^api\+\/auth\/callback$/, "api+/auth/callback.route"],
    [/^api\+\/docs\/openapi$/, "api+/docs/openapi.route"],
    [/^api\+\/disconnect$/, "api+/disconnect"],
    [/^api\+\/verify-audio-pin\/\$(\w+)$/, "api+/verify-audio-pin/$$$1.route"],
    [/^admin\+\/route\/route.*\.(\w+)$/, "admin+/workspaces/$workspaceId/$1.route"],
  ];
  for (const [re, repl] of rules) {
    if (re.test(rel)) return rel.replace(re, repl);
  }
  if (rel.startsWith("api+/ivr/route.")) {
    const tail = rel.slice("api+/ivr/route.".length).replace(/\./g, "/");
    if (tail.endsWith("/response")) {
      return `api+/ivr/${tail.slice(0, -"/response".length)}/response.route`;
    }
    return `api+/ivr/${tail}.route`;
  }
  if (rel.startsWith("api+/connect-campaign-conference/") && !rel.endsWith(".route")) {
    return `${rel}.route`;
  }
  return rel;
}

function fixImportSpecifier(spec) {
  const prefix = spec.startsWith("../") ? "../app/routes/" : "/app/routes/";
  if (!spec.includes("app/routes/")) return spec;
  let rel = normalizeRel(spec.split("app/routes/")[1]);
  rel = demangle(rel);
  const resolved = resolveModuleImportPath(rel);
  return `${prefix}${resolved}`;
}

const pathMap = JSON.parse(fs.readFileSync(PATH_MAP, "utf8"));
const flatIds = Object.keys(pathMap).sort((a, b) => b.length - a.length);

const replacements = [];
for (const flatId of flatIds) {
  const target = resolveModuleImportPath(pathMap[flatId]);
  for (const pre of ["../app/routes/", "/app/routes/"]) {
    replacements.push([`${pre}${flatId}`, `${pre}${target}`]);
  }
}
let changed = 0;
for (const file of walk(path.join(ROOT, "test"))) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  for (const [from, to] of replacements) {
    if (from !== to) src = src.split(from).join(to);
  }

  src = src.replace(
    /import\(["']([^"']*app\/routes\/[^"']+)["']\)/g,
    (m, spec) => `import("${fixImportSpecifier(spec)}")`,
  );
  src = src.replace(
    /vi\.mock\(["']([^"']*app\/routes\/[^"']+)["']/g,
    (m, spec) => `vi.mock("${fixImportSpecifier(spec)}"`,
  );

  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log(path.relative(ROOT, file));
  }
}

console.log(`updated ${changed} test file(s)`);
