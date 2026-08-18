#!/usr/bin/env node
/**
 * Fail if a route that touches tenant data cannot be shown to prove workspace
 * MEMBERSHIP — either in the route itself, or in the service function it calls.
 *
 * This is the companion to check-route-authz.mjs, which asks a different
 * question (does a `workspaceRouteAuth` WRITE enforce a minimum ROLE?) and only
 * scans app/routes/workspaces+/. That left the entire legacy `api+` surface
 * unexamined, which is where three cross-tenant IDORs lived: contacts.loader
 * took `workspace_id` straight from the query string, outreach-attempts derived
 * it from a caller-supplied contact_id, and campaign_audience proved only that
 * a campaign and an audience matched each other — never that the caller
 * belonged to either.
 *
 * WHY THIS FOLLOWS IMPORTS
 *
 * The obvious implementation — grep each route for `requireWorkspaceAccess` —
 * produces about twenty false positives, because this codebase legitimately
 * puts the membership check in the SERVICE layer. `api+/numbers` looks
 * unguarded but `purchaseWorkspaceNumber` calls requireWorkspaceAccess
 * internally; `workspace-api-keys` is guarded by requireApiKeyManager inside
 * listWorkspaceApiKeys; `caller-id` by requireNumbersManager. Flagging those
 * would mean an allowlist of ~20 entries — another hand-maintained list, which
 * is the bug class this whole exercise exists to remove.
 *
 * So: if a route has no membership proof of its own, resolve its local imports
 * one hop and look inside those modules for one. That is enough to clear every
 * legitimate case above while still catching the three real offenders, whose
 * service functions (searchContactsForQueuePicker, rpcCreateOutreachAttempt,
 * insertCampaignAudienceLink) genuinely do not check anything.
 *
 * One hop, not transitive: it is cheap, it has no cycle problems, and it
 * matches how this codebase is actually layered (route → service → db). If a
 * future check sits two hops down, the guard will report it and the fix is to
 * surface the check, not to deepen the crawl.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES = path.join(ROOT, "app/routes");

/** Anything that proves the caller belongs to the workspace being touched. */
const MEMBERSHIP_PROOF =
  /requireWorkspaceAccess\s*\(|requireWorkspaceLoaderContext\s*\(|requireMemberManager\s*\(|requireApiKeyManager\s*\(|requireNumbersManager\s*\(|getWorkspaceRouteContext\s*\(|getDataPlaneRouteContext\s*\(|dataPlaneCapabilityAuth\w*\s*\(|withWorkspaceApi\w*\s*\(|authFor(?:Campaign|Contact|Script|Survey|OutreachAttempt)\s*\(|workspaceRouteAuth\b|workspaceLoaderAuth\b|enforceWorkspaceRole\s*\(|requireSudo\s*\(|adminRouteAuth\b|getAdminRouteContext\s*\(|requireAdmin\w*\s*\(|context\.get\(\s*workspaceContext\s*\)|context\.get\(\s*dataPlaneAuthContext\s*\)/;

/** Requests that are authenticated as Twilio/Stripe/cron rather than as a user. */
const NON_USER_SURFACE =
  /requireTwilioSignature\w*\s*\(|requireTwilioEventsSinkSecret\s*\(|validateTwilioWebhook|constructEvent\s*\(|verifyCronSecret\s*\(|createCronEnqueueAction\s*\(|retiredEndpoint\s*\(/;

/**
 * Touches tenant data at all. A route with no tenancy has nothing to prove.
 * Import lines are stripped first: `WorkspaceSettingUtils.server` in a path is
 * not evidence that a route reads tenant data, and matching it flagged
 * test-webhook, which only posts to a caller-supplied URL.
 */
const TOUCHES_TENANT_DATA =
  /createTenantDb\s*\(|workspace_id|workspaceId|\bworkspace\b/;

/**
 * `getUserRole` returns null for a non-member, so calling it AND acting on the
 * result is a membership check — the idiom inbound-queue and surveys use.
 * Both halves are required: fetching the role and ignoring it proves nothing.
 */
const GETS_ROLE = /getUserRole\s*\(/;
const ACTS_ON_ROLE = /!\s*userRole|userRole\s*\?\.|userRole\.role|userRole\s*(?:===|!==)/;

/**
 * Public by design. Each entry needs a reason, and each is a decision someone
 * made deliberately — not a backlog.
 */
const PUBLIC_BY_DESIGN = new Map([
  ["survey+/$surveyId.loader.server.ts", "public survey page; scoped to the survey's own workspace"],
  ["api+/survey-answer.action.server.ts", "public survey respondent; workspace comes from the survey"],
  ["api+/survey-complete.action.server.ts", "public survey respondent; workspace comes from the survey"],
  ["api+/contact-form.action.server.ts", "public marketing contact form; no tenant data"],
  ["api+/auth/callback.loader.server.ts", "auth callback; no workspace in play"],
  ["auth/confirm.loader.server.ts", "email verification; no workspace in play"],
  ["remember.action.server.ts", "password reset request; no workspace in play"],
  ["signin.action.server.ts", "sign-in; no workspace yet"],
  ["two-factor.action.server.ts", "2FA verification; no workspace yet"],
  ["confirm-payment.loader.server.ts", "Stripe redirect; workspace read from the session metadata"],
  ["api+/me.loader.server.ts", "current user only; no workspace scope"],
  ["api+/workspaces.loader.server.ts", "lists the caller's own workspaces"],
  ["api+/error-report.action.server.ts", "client error sink; no tenant data"],
  // You are not a member yet — that is the point of accepting an invite.
  ["accept-invite.action.server.ts", "invite acceptance; membership is the outcome, not the precondition"],
  ["accept-invite.loader.server.ts", "invite acceptance; membership is the outcome, not the precondition"],
  // The caller's own account, scoped by session user id rather than workspace.
  ["account.loader.server.ts", "current user's own account; no workspace scope"],
  ["account.security.loader.server.ts", "current user's own 2FA settings; no workspace scope"],
  ["workspaces+/index.action.server.ts", "creates a workspace; no membership exists yet"],
  ["workspaces+/index.loader.server.ts", "lists the caller's own workspaces"],
  ["api+/workspaces.action.server.ts", "lists the caller's own workspaces / creates a new one"],
]);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(action|loader)\.server\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Resolve a local import specifier to a file on disk, or null. */
function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "app", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT_RE = /from\s+["']([^"']+)["']/g;
/** `import { a, b as c } from "x"` → the local names actually pulled in. */
const NAMED_IMPORT_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/**
 * The body of one exported function, from its declaration to the next
 * top-level `export`.
 *
 * Module-level matching is too coarse here: platform-telephony.server.ts holds
 * dozens of functions and some of them do check membership, so ANY importer of
 * that module looked guarded. Scanning only the functions a route actually
 * calls is what separates a guard that works from one that looks like it does —
 * verified by deleting the real checks from the three known IDOR routes and
 * confirming all three are reported.
 */
function functionBody(source, name) {
  const decl = new RegExp(
    `export\\s+(?:async\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\s*[:=])`,
  );
  const start = source.search(decl);
  if (start === -1) return null;
  const rest = source.slice(start + 1);
  const next = rest.search(/\nexport\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** True when the file, or any module it imports directly, proves membership. */
/**
 * Strip import/export lines before looking for a proof.
 *
 * Without this, importing the barrel that DEFINES requireWorkspaceAccess
 * counted as proof — so a route could import the guard, never call it, and pass.
 * Found by deleting the real checks from the three known IDOR routes and
 * watching this guard stay green. Only invocations count.
 */
function callSitesOnly(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*(import|export)\s/.test(line))
    .join("\n");
}

function importedSources(file, source) {
  const out = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const resolved = resolveLocal(match[1], file);
    if (!resolved) continue;
    try {
      out.push(fs.readFileSync(resolved, "utf8"));
    } catch {
      /* unreadable import; treated as proving nothing */
    }
  }
  return out;
}

/**
 * True when the file, or any module it imports directly, proves membership.
 * The one hop also covers pure re-export shims (`export { loader } from "./x"`),
 * which carry no logic of their own.
 */
function provesMembership(file, source, depth = 0) {
  const calls = callSitesOnly(source);
  if (MEMBERSHIP_PROOF.test(calls)) return true;
  if (GETS_ROLE.test(calls) && ACTS_ON_ROLE.test(calls)) return true;

  // A pure re-export shim (`export { loader } from "./x"`) carries no logic of
  // its own, so the hop into it should not count against the budget — the real
  // route module is one further on.
  const isShim = source
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("//"))
    .every((line) => /^\s*(export|import)\s/.test(line));

  // A shim re-exports someone else's route module; follow it whole.
  if (isShim && depth === 0) {
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveLocal(match[1], file);
      if (!resolved) continue;
      try {
        if (provesMembership(resolved, fs.readFileSync(resolved, "utf8"), 1)) return true;
      } catch {
        /* unreadable */
      }
    }
  }

  // Otherwise look only inside the specific functions this route imports.
  for (const match of source.matchAll(NAMED_IMPORT_RE)) {
    const resolved = resolveLocal(match[2], file);
    if (!resolved) continue;
    let imported;
    try {
      imported = fs.readFileSync(resolved, "utf8");
    } catch {
      continue;
    }
    const names = match[1]
      .split(",")
      .map((part) => part.split(/\sas\s/)[0].trim())
      .filter(Boolean);

    for (const name of names) {
      const body = functionBody(imported, name);
      if (!body) continue;
      const bodyCalls = callSitesOnly(body);
      if (MEMBERSHIP_PROOF.test(bodyCalls)) return true;
      if (GETS_ROLE.test(bodyCalls) && ACTS_ON_ROLE.test(bodyCalls)) return true;
    }
  }
  return false;
}

/** Same one-hop rule for webhook/cron surfaces, whose auth lives in a helper. */
function isNonUserSurface(file, source) {
  if (NON_USER_SURFACE.test(source)) return true;
  return importedSources(file, source).some((s) => NON_USER_SURFACE.test(s));
}

const offenders = [];
let scanned = 0;

for (const file of walk(ROUTES)) {
  const rel = path.relative(ROUTES, file).split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");

  if (PUBLIC_BY_DESIGN.has(rel)) continue;
  if (isNonUserSurface(file, source)) continue;
  if (!TOUCHES_TENANT_DATA.test(callSitesOnly(source))) continue;

  scanned++;
  if (!provesMembership(file, source)) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(
    "Routes touching tenant data with no workspace-membership proof:\n",
  );
  for (const rel of offenders) console.error(`  app/routes/${rel}`);
  console.error(
    "\nProve membership in the route (requireWorkspaceAccess after resolving the\n" +
      "workspace) or in the service function it calls — this guard follows local\n" +
      "imports one hop. If the route is genuinely public, add it to\n" +
      "PUBLIC_BY_DESIGN in this file WITH A REASON.",
  );
  process.exit(1);
}

console.log(
  `Route membership check passed: ${scanned} tenant-data route(s), all prove membership.`,
);
