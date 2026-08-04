#!/usr/bin/env node
/**
 * Fail if route modules under app/routes/workspaces+/** import getWorkspaceById.
 *
 * getWorkspaceById does a bare `select()` and returns every workspace column,
 * including the Twilio API key pair (key/token), the twilio_data JSON blob
 * (account SID + authToken) and stripe_id. Route loaders assign the row into
 * routeData(), which serializes it into client-visible payloads.
 *
 * Route loaders must use getWorkspaceForClient, whose SQL-level column
 * projection keeps the secret columns in the database.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes/workspaces+");
const FORBIDDEN = "getWorkspaceById";
const REPLACEMENT = "getWorkspaceForClient";

function isLegacy(rel) {
  return (
    rel.includes("/archive/") ||
    rel.startsWith("archive/") ||
    /\/old\./.test(rel) ||
    rel.startsWith("old.")
  );
}

/** Match the identifier only inside an import/export-from statement. */
function importsForbidden(source) {
  const stmts = source.match(
    /(?:^|\n)\s*(?:import|export)\s[\s\S]*?from\s+["'][^"']+["']/g,
  );
  if (!stmts) return false;
  return stmts.some((stmt) =>
    new RegExp(`\\b${FORBIDDEN}\\b`).test(stmt),
  );
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(ROUTES)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (isLegacy(rel)) continue;

  const source = fs.readFileSync(file, "utf8");
  if (importsForbidden(source)) hits.push(rel);
}

if (hits.length) {
  console.error(
    `Route modules under app/routes/workspaces+/** must not import ${FORBIDDEN} ` +
      `(it returns workspace secrets: key, token, twilio_data, stripe_id).\n` +
      `Use ${REPLACEMENT} instead:\n`,
  );
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log("Workspace projection check passed.");
