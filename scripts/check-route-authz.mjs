#!/usr/bin/env node
/**
 * Fail if a workspace WRITE action (`app/routes/workspaces+/**\/*.action.server.ts`
 * with a db-write / credit / external side effect, authed by `workspaceRouteAuth`)
 * does not enforce a minimum role.
 *
 * Background: `workspaceRouteAuth` proves *membership* but is role-blind unless the
 * handler checks. A deep audit found ~14 write routes that never did, letting a
 * `caller` (lowest role) create campaigns, contacts, audiences, and initiate
 * billing checkout. This guard makes that class un-shippable: every workspace
 * write action must show a role check, or be on the explicit caller-open allowlist.
 *
 * A role check must be an ENFORCING construct — a `hasMinRole(` call, or a
 * `userRole ===/!==` / `role ===/!==` comparison (some routes predate hasMinRole).
 * A bare `MemberRole.` token does NOT count: it matches imports and the minRole
 * argument, so it would let a gutted gate pass (verified — that false-negative is
 * why this regex is deliberately narrow).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "app/routes/workspaces+");

// Routes a `caller` (rank 1) is intended to use — dialing, live handset, chat.
// Membership (workspaceRouteAuth) is the only gate these need. Keep this list
// tiny and justified; adding to it is a deliberate security decision.
const CALLER_OPEN = new Set([
  "$id/campaigns/$campaign_id/call.action.server.ts",
  "$id/handset.action.server.ts",
  "$id/chats.action.server.ts",
]);

const WRITE_EFFECT = /sideEffects:\s*\[[^\]]*(?:"|')(?:db-write|credit|external)(?:"|')/;
const USES_WS_AUTH = /auth:\s*workspaceRouteAuth\b/;
const ROLE_CHECK = /hasMinRole\s*\(|(?:userRole|role)\s*(?:===|!==)/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".action.server.ts")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(DIR)) {
  const rel = path.relative(DIR, file);
  const src = fs.readFileSync(file, "utf8");
  if (!USES_WS_AUTH.test(src) || !WRITE_EFFECT.test(src)) continue;
  if (CALLER_OPEN.has(rel)) continue;
  if (!ROLE_CHECK.test(src)) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(
    "Route authz check FAILED — workspace write action(s) with no role gate:\n",
  );
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\nAdd a minimum-role check (hasMinRole(userRole, MemberRole.X) → 403) before" +
      "\nany write, or — only if a caller legitimately needs it — add the route to" +
      "\nCALLER_OPEN in scripts/check-route-authz.mjs with justification.",
  );
  process.exit(1);
}

console.log(
  `Route authz check passed: every workspace write action gates on role (${CALLER_OPEN.size} caller-open by design).`,
);
