#!/usr/bin/env node
/**
 * Fail if a route authenticated with `requireDualAuth` neither rejects API-key
 * callers nor cross-checks the key's bound workspace.
 *
 * Background: `requireDualAuth` admits BOTH a session and a workspace API key.
 * An API-key result has no `user` — it carries `{ authType: "api_key",
 * workspaceId, keyId, scopes }`. That matters because `requireWorkspaceAccess`
 * needs a user id, so it cannot check an API-key caller at all. A route that
 * calls `requireDualAuth` and then reasons only about resource ids is, for
 * key-bearing callers, completely unguarded.
 *
 * That is exactly what happened to `api+/campaign_audience`: declared
 * `authClass: "session"` / `exposure: "sessionOnly"` in the API surface, but
 * authed with `requireDualAuth` and never touching `auth` — so a key bound to
 * workspace A could link an audience onto a campaign in workspace B and
 * mass-enqueue its contacts for live dialing.
 *
 * A route satisfies this guard by doing one of:
 *   - `getDualAuthUser(auth)` and 401-ing when it returns null (the
 *     campaign_queue.action.server.ts shape), or
 *   - comparing `auth.workspaceId` / branching on `authType === "api_key"`
 *     (the platform-data.server.ts `authFor*` shape), or
 *   - delegating to an `authFor*` helper that does the above.
 *
 * There was exactly one offender when this was written, which is what makes it
 * cheap to enforce now rather than after the next one.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROOTS = [path.join(ROOT, "app/routes")];

// An actual invocation, not a stray import. test-webhook.action.server.ts
// imports requireDualAuth but authenticates with requireJsonAuth, and a
// bare-name match flagged it.
const USES_DUAL_AUTH = /requireDualAuth\s*\(/;
const HANDLES_API_KEY =
  /getDualAuthUser\s*\(|authType\s*===\s*["']api_key["']|auth\.workspaceId|authFor(?:Campaign|Contact|Script|Survey|OutreachAttempt)\s*\(/;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(action|loader)\.server\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
let scanned = 0;

for (const dir of ROOTS) {
  for (const file of walk(dir)) {
    const src = fs.readFileSync(file, "utf8");
    if (!USES_DUAL_AUTH.test(src)) continue;
    scanned++;
    if (!HANDLES_API_KEY.test(src)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "Routes using requireDualAuth without handling API-key callers:\n",
  );
  for (const rel of offenders) console.error(`  ${rel}`);
  console.error(
    "\nrequireDualAuth admits a workspace API key, which has no `user` — so\n" +
      "requireWorkspaceAccess cannot check it. Either reject key callers\n" +
      "(`const user = getDualAuthUser(auth); if (!user) return 401`) or\n" +
      "cross-check `auth.workspaceId` against the resolved workspace.",
  );
  process.exit(1);
}

console.log(
  `Dual-auth exposure check passed: ${scanned} route(s) using requireDualAuth all handle API-key callers.`,
);
