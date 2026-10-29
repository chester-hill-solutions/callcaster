#!/usr/bin/env node
/**
 * Auth rate-limit coverage gate (#2220).
 *
 * Every route that consumes an unauthenticated credential must declare an
 * `auth:` rate-limited scope. Grounded in a real finding: the HTML signup form
 * and the HTML reset-password form both created accounts and reset passwords
 * with no limiter, while their JSON twins and `signin`/`two-factor` had one.
 * Nothing enforced the choice, and the existing split was along no clean axis
 * — `remember` is an HTML route using the `auth:` strategy, `signin` is an
 * HTML route calling the limiter in-handler. So the next auth action added by
 * copying a neighbour would ship unthrottled too.
 *
 * The set of protected surfaces is DERIVED FROM CALL SITES, not from a list of
 * filenames. A filename list is the same trap wearing a different hat: it goes
 * stale silently and the guard passes on the route nobody remembered to add.
 * Here, a new auth action that calls `auth.api.signInEmail` is covered the
 * moment it exists.
 *
 * Scope names are cross-checked against the LIMITS table in
 * app/lib/platform-auth-rate-limit.server.ts, so a typo or a scope deleted
 * from that table fails here rather than silently allowing everything.
 *
 * Exemptions are explicit and must carry a reason. They are not a ratchet
 * baseline to be burned down silently — each one is an argument a reviewer can
 * read and disagree with.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeAuthRateLimitSource } from "./lib/auth-rate-limit-analysis.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `--routes-dir <path>` points the scan at a fixture tree instead of app/routes,
// so the gate's own test can prove it fails on a planted violation without
// writing into the real route tree. Same convention as check-changelog's --base.
const routesIdx = process.argv.indexOf("--routes-dir");
const ROUTES_DIR =
  routesIdx >= 0 && process.argv[routesIdx + 1]
    ? path.resolve(process.argv[routesIdx + 1])
    : path.join(ROOT, "app", "routes");
const LIMITER_PATH = path.join(
  ROOT,
  "app",
  "lib",
  "platform-auth-rate-limit.server.ts",
);
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];

// Expected operation budgets, independent of the route's own declarations.
const CATCH_ALL_OPERATION_SCOPES = {
  "sign-in": "auth:sign-in",
  "two-factor": "auth:sign-in",
  "change-password": "auth:sign-in",
  "sign-up": "auth:register",
  "request-password-reset": "auth:forgot-password",
  "reset-password": "auth:reset-password",
  "email-otp": "auth:verify-email",
};
const SESSION_LIFECYCLE_PATHS = new Set([
  "/api/auth/sign-out",
  "/api/auth/revoke-session",
  "/api/auth/revoke-sessions",
  "/api/auth/revoke-other-sessions",
]);

/**
 * Surfaces that consume a credential but are not brute-forceable, so a limiter
 * would cost a DB round-trip and buy nothing. Each needs a reason a reviewer
 * can check.
 */
const EXEMPTIONS = new Map([
  [
    "app/routes/auth/confirm.loader.server.ts",
    "Emailed verification link carrying a long random token, not a guessable\n" +
      "     code. The guessable 6-digit OTP path (api+/auth/verify-email) is limited.",
  ],
  [
    "app/routes/api+/auth/callback.loader.server.ts",
    "Same emailed-link token as auth/confirm — a 128-bit random token cannot be\n" +
      "     brute-forced, and this loader only completes a flow the user started.",
  ],
]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (/\.(tsx|ts)$/.test(e.name)) {
      const rel = path.relative(ROOT, path.join(dir, e.name));
      if (!SKIP_FILE.some((re) => re.test(rel)))
        out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Scope names the limiter module actually defines. */
function definedScopes(file) {
  const src = fs.readFileSync(file, "utf8");
  const table = src.slice(src.indexOf("const LIMITS"));
  return new Set(
    [...table.matchAll(/"((?:auth|2fa):[a-z-]+)":/g)].map((m) => m[1]),
  );
}

function checkHandlerPolicy(info, rel) {
  const problems = [];
  if (!info.hasLimiter || !info.usesEndpointPolicy)
    problems.push(
      `  ${rel}: auth.handler must use the auth endpoint scope policy`,
    );
  if (!info.strictDefault)
    problems.push(
      `  ${rel}: auth endpoint scope policy must retain its strict default`,
    );
  for (const [operation, scope] of Object.entries(CATCH_ALL_OPERATION_SCOPES)) {
    if (info.operationScopes.get(operation) !== scope)
      problems.push(`  ${rel}: ${operation} must use ${scope}`);
  }
  if (!info.validOperationTable)
    problems.push(`  ${rel}: scope policy must use a literal operation table`);
  const strictScopes = new Set(Object.values(CATCH_ALL_OPERATION_SCOPES));
  for (const [operation, scope] of info.operationScopes) {
    if (!strictScopes.has(scope))
      problems.push(
        `  ${rel}: ${operation} must use a strict credential scope`,
      );
  }
  const wrong = [...info.sessionPaths].filter(
    (p) => !SESSION_LIFECYCLE_PATHS.has(p),
  );
  const missing = [...SESSION_LIFECYCLE_PATHS].filter(
    (p) => !info.sessionPaths.has(p),
  );
  if (wrong.length || missing.length)
    problems.push(
      `  ${rel}: only the exact session lifecycle paths may use the loose budget`,
    );
  return problems;
}

const scopes = definedScopes(LIMITER_PATH);
const setupScopes = definedScopes(
  path.join(ROOT, "app/lib/two-factor-rate-limit.server.ts"),
);
const scopesByFamily = { auth: scopes, "2fa": setupScopes };
const rows = [];
const violations = [];

for (const file of walk(ROUTES_DIR).sort()) {
  // Keyed off the route's own path, not the scan root, so an exemption means
  // the same thing whether the scan covers app/routes or a fixture tree.
  const rel = path.posix.join(
    "app/routes",
    toPosix(path.relative(ROUTES_DIR, file)),
  );
  const src = fs.readFileSync(file, "utf8");
  const info = analyzeAuthRateLimitSource(src, file);
  const hits = info.hits.map((hit) => hit.call);
  if (hits.length === 0 && !info.hasHandler) continue;
  if (info.hasHandler) violations.push(...checkHandlerPolicy(info, rel));

  if (info.hasLimiter) {
    const declared = info.declared.map((entry) => entry.scope);
    const unknown = [
      ...info.declared
        .filter((entry) => !scopesByFamily[entry.family].has(entry.scope))
        .map((entry) => entry.scope),
      ...[...info.operationScopes.values()].filter(
        (scope) => !scopes.has(scope),
      ),
    ];
    rows.push({ rel, hits, declared, state: "limited" });
    if (unknown.length > 0) {
      violations.push(
        `  ${rel}: declares scope(s) not defined in platform-auth-rate-limit.server.ts — ${unknown.join(", ")}`,
      );
    }
    for (const hit of info.hits) {
      if (!hit.scopes.some((scope) => declared.includes(scope)))
        violations.push(
          `  ${rel}: ${hit.call} must use operation scope ${hit.scopes.join(" or ")}`,
        );
    }
    continue;
  }

  const exemption = EXEMPTIONS.get(rel);
  if (exemption) {
    rows.push({ rel, hits, declared: [], state: "exempt" });
    continue;
  }
  rows.push({ rel, hits, declared: [], state: "unlimited" });
  violations.push(
    `  ${rel}: consumes a credential (${hits.join(", ")}) with no rate limit.\n` +
      `     Add enforceAuthRateLimit(request, "auth:<scope>") in the handler, or\n` +
      `     auth: rateLimitedPostAuth("auth:<scope>"), or add an entry to\n` +
      `     EXEMPTIONS in scripts/check-auth-rate-limits.mjs with a reason.`,
  );
}

if (violations.length > 0) {
  console.error(
    "check-auth-rate-limits: unprotected auth credential surface:\n",
  );
  console.error(violations.join("\n\n"));
  console.error(
    `\n${rows.filter((r) => r.state === "limited").length} limited, ` +
      `${rows.filter((r) => r.state === "exempt").length} exempt, ` +
      `${rows.filter((r) => r.state === "unlimited").length} unprotected ` +
      `across ${rows.length} credential surface(s).`,
  );
  process.exit(1);
}

const limited = rows.filter((r) => r.state === "limited").length;
const exempt = rows.filter((r) => r.state === "exempt").length;
console.log(
  `Auth rate-limit gate passed: ${limited} credential surface(s) declare a rate limit, ` +
    `${exempt} carry a reasoned exemption, 0 unprotected. Scope names cross-checked ` +
    `against ${scopes.size} auth scopes and ${setupScopes.size} 2FA setup scopes.`,
);
