#!/usr/bin/env node
/**
 * ADR-0031: child route server modules under product middleware trees must read
 * context via typed getters — not re-run session/membership auth inline.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");

const TREES = [
  {
    name: "workspace",
    prefix: "workspaces+/$id/",
    // workspaceRouteAuth/workspaceLoaderAuth are the shared handler-factory
    // strategies wrapping the same context getters.
    required: [
      /getWorkspaceRouteContext/,
      /requireWorkspaceLoaderContext/,
      /workspaceRouteAuth/,
      /workspaceLoaderAuth/,
    ],
    forbidden: [
      { pattern: /from\s+["']@\/lib\/auth\.server["']/, label: "auth.server import" },
      { pattern: /\bverifyAuth\s*\(/, label: "verifyAuth()" },
      { pattern: /\bgetSession\s*\(/, label: "getSession()" },
    ],
    excludeSuffixes: [
      "chats/$contact_number.messages.server.ts",
    ],
    excludeExact: [],
  },
  {
    name: "data-plane",
    prefix: "api+/workspaces+/$workspaceId/",
    required: [/getDataPlaneRouteContext/],
    forbidden: [
      { pattern: /\bresolveDataPlaneAuth\s*\(/, label: "resolveDataPlaneAuth()" },
      { pattern: /from\s+["']@\/lib\/platform-data\.server["'].*resolveDataPlaneAuth/, label: "resolveDataPlaneAuth import" },
      { pattern: /\bverifyAuth\s*\(/, label: "verifyAuth()" },
      { pattern: /\brequireJsonAuth\s*\(/, label: "requireJsonAuth()" },
      { pattern: /withWorkspaceApiLoader/, label: "withWorkspaceApiLoader" },
      { pattern: /withWorkspaceApiAction/, label: "withWorkspaceApiAction" },
    ],
    excludeSuffixes: ["api-keys.loader.server.ts"],
    excludeExact: [],
  },
  {
    name: "admin",
    prefix: "admin+/",
    // adminRouteAuth is the shared handler-factory strategy wrapping the getter.
    required: [/getAdminRouteContext/, /adminRouteAuth/],
    forbidden: [
      { pattern: /\bverifyAuth\s*\(/, label: "verifyAuth()" },
      { pattern: /\brequireSudoAdmin\s*\(/, label: "requireSudoAdmin()" },
    ],
    excludeSuffixes: [
      "route.middleware.server.ts",
      "requireSudoAdmin.server.ts",
      "workspaces/$workspaceId/loadTwilioData.server.ts",
    ],
    excludeExact: [],
  },
];

function isReexportOnly(source) {
  const withoutComments = source.replace(/\/\/[^\n]*/g, "").trim();
  const lines = withoutComments.split("\n").filter((line) => line.trim());
  return (
    lines.length > 0 &&
    lines.every((line) =>
      /^export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/.test(line.trim()),
    )
  );
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out);
    } else if (ent.name.endsWith(".server.ts")) {
      out.push(full);
    }
  }
  return out;
}

function relRoutePath(absPath) {
  return path.relative(ROUTES, absPath).split(path.sep).join("/");
}

function isLegacy(rel) {
  return rel.includes("/archive/") || rel.startsWith("archive/") || /\/old\./.test(rel);
}

const violations = [];

for (const tree of TREES) {
  const treeDir = path.join(ROUTES, ...tree.prefix.split("/"));
  if (!fs.existsSync(treeDir)) continue;

  for (const file of walk(treeDir)) {
    const rel = relRoutePath(file);
    if (isLegacy(rel)) continue;
    if (tree.excludeSuffixes.some((suffix) => rel.endsWith(suffix))) continue;
    if (tree.excludeExact.includes(rel)) continue;

    const source = fs.readFileSync(file, "utf8");
    if (isReexportOnly(source)) continue;

    const missingGetter = !tree.required.some((pattern) => pattern.test(source));
    const forbiddenHits = tree.forbidden.filter((rule) => rule.pattern.test(source));

    if (missingGetter || forbiddenHits.length > 0) {
      violations.push({
        tree: tree.name,
        rel: `app/routes/${rel}`,
        missingGetter,
        forbiddenHits: forbiddenHits.map((hit) => hit.label),
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Middleware adoption check failed:\n");
  for (const v of violations) {
    console.error(`  [${v.tree}] ${v.rel}`);
    if (v.missingGetter) {
      console.error("    - missing context getter");
    }
    for (const hit of v.forbiddenHits) {
      console.error(`    - forbidden: ${hit}`);
    }
  }
  process.exit(1);
}

console.log("Middleware adoption check passed.");
