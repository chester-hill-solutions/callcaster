#!/usr/bin/env node
/* eslint-env node */
/**
 * Live surface contract prober.
 *
 * Hits EVERY endpoint in the API surface inventory against a running server
 * and asserts two classes of contract:
 *
 *   1. REACHABILITY — the route is actually served. This exists because a
 *      registered route can silently stop matching: `[...all].route.tsx` was
 *      read by remix-flat-routes as the LITERAL path `/api/auth/...all`, so
 *      every Better Auth endpoint (sign-in, get-session, sign-out) 404'd for
 *      months while 2000+ unit tests passed. Unit tests import handlers
 *      directly and therefore cannot see routing failures.
 *
 *   2. DECLARED AUTH — the response for a no-credentials request matches the
 *      entry's `authClass` (e.g. a `twilioSignature` webhook must reject).
 *
 * Reachability is detected by distinguishing React Router's unmatched-route
 * 404 (which renders the app's HTML 404 *document*) from a legitimate
 * resource-level 404 (JSON from a loader). An HTML body on an `/api/` path is
 * the signature of "no route matched".
 *
 * Usage — named targets, correct defaults, no flags needed:
 *
 *   npm run probe:dev        npm run probe:staging      npm run probe:prod
 *   npm run probe:local      npm run probe -- --help
 *
 * Deployed targets default to strict provider auth + page routes; `local`
 * relaxes provider auth because the compose harness sets
 * TWILIO_VALIDATE_WEBHOOKS=false. Override with --strict / --relaxed /
 * --no-pages.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { API_SURFACE } from "../app/lib/api-surface.ts";
import {
  AUDIENCE_ID,
  CAMPAIGNS,
  CONTACT_IDS,
  SCRIPT_IDS,
  SURVEY,
  WORKSPACES,
  WORKSPACE_NUMBER_ID,
} from "./e2e/seed-data.mjs";

const args = process.argv.slice(2);
function flagValue(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

/**
 * Named targets so nobody has to remember a Railway hostname. Override any of
 * them with an env var (that is how staging gets a URL before it is a
 * hard-coded constant).
 */
const TARGETS = {
  local: process.env.PROBE_URL_LOCAL ?? "http://127.0.0.1:3100",
  dev:
    process.env.PROBE_URL_DEV ??
    "https://callcaster-review-visual-asset-review.up.railway.app",
  staging: process.env.PROBE_URL_STAGING ?? null,
  prod: process.env.PROBE_URL_PROD ?? "https://callcaster.ca",
};

function usage() {
  return [
    "Usage: npm run probe:<target>        (target: local | dev | staging | prod)",
    "   or: npm run probe -- <target|url> [flags]",
    "",
    "Defaults are chosen per target — you should not normally need flags:",
    "  deployed targets  strict provider auth ON, page routes ON",
    "  local             provider auth RELAXED (the compose harness sets",
    "                    TWILIO_VALIDATE_WEBHOOKS=false), page routes ON",
    "",
    "Flags: --strict | --relaxed | --no-pages | --json <file> | --timeout <ms>",
    "Env:   PROBE_URL_LOCAL / PROBE_URL_DEV / PROBE_URL_STAGING / PROBE_URL_PROD",
  ].join("\n");
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

// First non-flag argument is the target; --base-url still works for scripts.
const positional = args.find((a) => !a.startsWith("-"));
const explicitUrl = flagValue("--base-url") ?? process.env.PROBE_BASE_URL;
const targetName =
  positional && !positional.startsWith("http") ? positional : null;

if (targetName && !(targetName in TARGETS)) {
  console.error(`Unknown target "${targetName}".\n\n${usage()}`);
  process.exit(1);
}
if (targetName === "staging" && !TARGETS.staging) {
  console.error(
    "Staging has no URL yet. Set PROBE_URL_STAGING=https://… (or add it to\n" +
      "TARGETS in this file once the environment is provisioned).",
  );
  process.exit(1);
}

const resolvedUrl =
  explicitUrl ??
  (targetName ? TARGETS[targetName] : null) ??
  (positional?.startsWith("http") ? positional : null) ??
  TARGETS.local;

const BASE_URL = resolvedUrl.replace(/\/$/, "");
const isLocalTarget =
  targetName === "local" ||
  /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(BASE_URL);

// Deployed environments enforce provider signatures; the compose harness
// disables them. Default accordingly so the common case needs no flags, and
// let either side be forced explicitly.
const STRICT_PROVIDER_AUTH = args.includes("--strict")
  ? true
  : args.includes("--relaxed")
    ? false
    : !isLocalTarget;
const INCLUDE_PAGES = !args.includes("--no-pages");
const JSON_OUT = flagValue("--json");
const TIMEOUT_MS = Number(flagValue("--timeout", "15000"));

/**
 * Concrete values for templated params. Seeded IDs exist for most; the rest
 * get syntactically valid synthetic values, where a resource-level 404 is an
 * acceptable answer (it still proves the route matched).
 */
const PARAM_VALUES = {
  workspaceId: WORKSPACES.ready.id,
  id: WORKSPACES.ready.id,
  campaignId: String(CAMPAIGNS.liveCall),
  campaign_id: String(CAMPAIGNS.liveCall),
  audienceId: String(AUDIENCE_ID),
  audience_id: String(AUDIENCE_ID),
  contactId: String(CONTACT_IDS[0]),
  contact_id: String(CONTACT_IDS[0]),
  scriptId: String(SCRIPT_IDS.live),
  surveyId: SURVEY.publicId,
  pageId: String(SURVEY.pageId),
  numberId: String(WORKSPACE_NUMBER_ID),
  number: "+15555501002",
  contactNumber: "+15555501002",
  contact_number: "+15555501002",
  // No seeded row — a matched route may legitimately 404 on these.
  roomId: "probe-room",
  callSid: "CAprobe00000000000000000000000000",
  messageSid: "SMprobe00000000000000000000000000",
  uploadId: "probe-upload",
  sessionId: "probe-session",
  blockId: "probe-block",
  pin: "000000",
  fileName: "probe.mp3",
  userId: "b1000000-0000-4000-8000-000000000001",
  selected_id: WORKSPACES.ready.id,
};


/**
 * Every param value must be a usable path segment.
 *
 * `workspaceId` was `WORKSPACES.ready` — the seed *object* `{id, name}` — not
 * `.id`, so every workspace-scoped probe requested
 * `/api/workspaces/[object Object]/...` and the run still reported 261/261.
 * The probe's auth-conformance checks stayed meaningful (an unauthenticated
 * request is rejected whatever the id), but nothing workspace-scoped was
 * really being exercised. Fail loudly rather than silently probing nonsense.
 */
for (const [param, value] of Object.entries(PARAM_VALUES)) {
  if (typeof value !== "string" || value === "" || value.includes("[object")) {
    console.error(
      `[probe-surfaces] PARAM_VALUES.${param} is not a usable path segment: ${JSON.stringify(value)}\n` +
        "  Pass the id (e.g. WORKSPACES.ready.id), not the seed object.",
    );
    process.exit(2);
  }
}

/**
 * Param names are not globally unique: `:id` is a workspace UUID on page
 * routes but a numeric outreach-attempt id here. Per-path overrides win.
 */
const PATH_PARAM_OVERRIDES = {
  "/api/outreach_attempts/:id": { id: String(CONTACT_IDS[0]) },
};

/**
 * Responses that are correct despite not matching the generic authClass rule.
 * Every entry needs a reason — this list must never become a silent muffler.
 */
const EXPECTED_EXCEPTIONS = [
  {
    method: "POST",
    path: "/api/auth/signout",
    statuses: [200],
    reason: "sign-out is idempotent; no session to end is a no-op, not an error",
  },
];

function findException(entry, operation, status) {
  return EXPECTED_EXCEPTIONS.find(
    (e) =>
      e.path === entry.path &&
      e.method === operation.method &&
      e.statuses.includes(status),
  );
}

function expandPath(templatePath) {
  const unresolved = [];
  const overrides = PATH_PARAM_OVERRIDES[templatePath] ?? {};
  const concrete = templatePath
    .split("/")
    .map((segment) => {
      if (segment === "*") return "probe-splat";
      if (!segment.startsWith(":")) return segment;
      const name = segment.slice(1);
      const value = overrides[name] ?? PARAM_VALUES[name];
      if (value === undefined) {
        unresolved.push(name);
        return "probe-unknown";
      }
      return encodeURIComponent(value);
    })
    .join("/");
  return { concrete, unresolved };
}

/** Minimal, method-appropriate probe request with NO credentials. */
function buildRequestInit(operation) {
  const method = operation.method;
  if (method === "GET" || method === "HEAD") {
    return { method, redirect: "manual" };
  }
  const headers = {};
  let body;
  switch (operation.bodyType) {
    case "form":
    case "twiml":
    case "rawWebhook":
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = "CallSid=CAprobe00000000000000000000000000&From=%2B15555501002";
      break;
    case "multipart":
      // Deliberately no body: we assert reachability/auth, not parsing.
      break;
    case "query":
      break;
    case "json":
    default:
      headers["content-type"] = "application/json";
      body = "{}";
      break;
  }
  return { method, headers, body, redirect: "manual" };
}

const APP_404_MARKERS = ["404 — CallCaster", "404 &#x2014; CallCaster"];

/**
 * Did React Router fail to match a route? The app's 404 document is HTML; a
 * route that matched returns JSON/XML/TwiML (or an HTML *page* for page
 * routes, which is why this check is scoped to /api/ paths).
 */
function looksUnrouted(pathname, status, contentType, bodyText) {
  if (status !== 404) return false;
  const isHtml =
    contentType.includes("text/html") ||
    APP_404_MARKERS.some((marker) => bodyText.includes(marker));
  if (!isHtml) return false;
  return pathname.startsWith("/api/");
}

/**
 * Expected no-credential outcomes per declared authClass.
 * `null` for provider classes in relaxed mode = "reachability only".
 */
function evaluateAuthContract(entry, status, hasUnresolvedParams) {
  const cls = entry.authClass;

  if (status >= 500) {
    return { ok: false, reason: `server error ${status}` };
  }
  // 410 is a deliberately retired endpoint: reachable and self-documenting.
  if (status === 410) {
    return { ok: true, reason: "410 — retired endpoint" };
  }
  // 405 proves the route matched but the method differs from the inventory's
  // claim — a real inventory/route drift, worth surfacing.
  if (status === 405) {
    return { ok: false, reason: "405 — method not allowed (inventory drift?)" };
  }

  const rejected = status === 401 || status === 403;
  const redirectedToSignin = status === 302 || status === 303;

  switch (cls) {
    case "twilioSignature":
    case "stripeSignature":
      if (!STRICT_PROVIDER_AUTH) return { ok: true, reason: "reachable (relaxed)" };
      if (status === 403 || status === 400) return { ok: true };
      return {
        ok: false,
        reason: `unsigned provider webhook returned ${status}, expected 403 (or 400)`,
      };

    case "session":
    case "apiKeyOrSession":
    case "workspaceAdmin":
      if (rejected || redirectedToSignin) return { ok: true };
      // Non-members are deliberately shown 404 to hide existence.
      if (status === 404) return { ok: true, reason: "404 (existence hidden)" };
      if (status === 400 && hasUnresolvedParams) {
        return { ok: true, reason: "400 on synthetic param" };
      }
      return {
        ok: false,
        reason: `unauthenticated request returned ${status}; expected 401/403/redirect`,
      };

    case "publicForm":
      if (status === 401) {
        return { ok: false, reason: "public surface returned 401" };
      }
      return { ok: true };

    case "internalTrusted":
      // Mixed by design (cron secret → 401, Twilio-fronted → 403, admin →
      // session). Reachability + no-5xx is the enforceable invariant.
      return { ok: true, reason: `reachable (${status})` };

    case "weakUnknown":
      return { ok: false, reason: "weakUnknown authClass must not ship" };

    default:
      return { ok: true, reason: `unclassified (${status})` };
  }
}

async function probe(entry, operation) {
  const { concrete, unresolved } = expandPath(entry.path);
  const url = `${BASE_URL}${concrete}`;
  const init = buildRequestInit(operation);

  let status = 0;
  let contentType = "";
  let bodyText = "";
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    contentType = response.headers.get("content-type") ?? "";
    bodyText = (await response.text()).slice(0, 2000);
  } catch (error) {
    return {
      path: entry.path,
      url: concrete,
      method: operation.method,
      authClass: entry.authClass,
      status: 0,
      ok: false,
      reason: `request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (looksUnrouted(concrete, status, contentType, bodyText)) {
    return {
      path: entry.path,
      url: concrete,
      method: operation.method,
      authClass: entry.authClass,
      status,
      ok: false,
      reason:
        "NOT ROUTED — app 404 document returned; the route is in the inventory but no route matched",
    };
  }

  const exception = findException(entry, operation, status);
  const verdict = exception
    ? { ok: true, reason: `expected exception: ${exception.reason}` }
    : evaluateAuthContract(entry, status, unresolved.length > 0);
  return {
    path: entry.path,
    url: concrete,
    method: operation.method,
    authClass: entry.authClass,
    status,
    ok: verdict.ok,
    reason: verdict.reason ?? null,
  };
}

// ─── Page routes ────────────────────────────────────────────────────────
// API probing is inventory-driven; page routes have no inventory, so they are
// enumerated from the router itself and classified by reading the code that
// guards them (never a hand-maintained list — those drift).

const ROUTE_OPEN = /<Route(?:\s+(index))?(?:\s+path="([^"]*)")?\s+file="([^"]+)"/;
const ROUTE_CLOSE = /<\/Route>/;

function enumeratePageRoutes() {
  const tmpFile = path.join(os.tmpdir(), `probe-routes-${process.pid}.txt`);
  let out = "";
  try {
    execSync(`npx react-router routes > ${JSON.stringify(tmpFile)} 2>/dev/null`);
    out = readFileSync(tmpFile, "utf8");
  } catch {
    out = existsSync(tmpFile) ? readFileSync(tmpFile, "utf8") : "";
  } finally {
    rmSync(tmpFile, { force: true });
  }

  const stack = [];
  const routes = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    const open = trimmed.match(ROUTE_OPEN);
    if (open) {
      const [, isIndex, segment, file] = open;
      const routeModule = file.replace(/^routes\//, "app/routes/");
      const selfClosing = trimmed.endsWith("/>");
      if (segment) stack.push(segment);
      const joined = stack.join("/");
      // Index routes inherit the parent's joined path ("" → "/").
      if (!joined.startsWith("api/") && file !== "root.tsx") {
        routes.push({ path: `/${joined}`, routeModule, isIndex: Boolean(isIndex) });
      }
      if (segment && selfClosing) stack.pop();
      continue;
    }
    if (ROUTE_CLOSE.test(trimmed)) stack.pop();
  }

  const seen = new Set();
  return routes.filter((r) => {
    const key = `${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const LOADER_AUTH_MARKERS = [
  "verifyAuth",
  "createAuthLayoutLoader",
  "requireWorkspaceAccess",
  "requireUserSession",
];

/**
 * Protected = guarded by a route-tree middleware, or by an auth call in the
 * route's own loader. Both are read from the source, so adding a new guarded
 * page needs no edit here.
 */
function classifyPageRoute(routeModule) {
  if (
    routeModule.startsWith("app/routes/workspaces+/$id") ||
    routeModule.startsWith("app/routes/admin+/")
  ) {
    return "protected";
  }
  const loaderModule = routeModule.replace(/\.route\.tsx$|\.tsx$/, ".loader.server.ts");
  if (existsSync(loaderModule)) {
    const source = readFileSync(loaderModule, "utf8");
    if (LOADER_AUTH_MARKERS.some((marker) => source.includes(marker))) {
      return "protected";
    }
  }
  return "public";
}

async function probePage(route) {
  const { concrete } = expandPath(route.path);
  // Probe the exact path; appending a trailing slash would invite avoidable
  // normalisation redirects and blur the real response.
  const url = `${BASE_URL}${concrete === "/" ? "/" : concrete}`;
  const classification = classifyPageRoute(route.routeModule);
  const isParameterized = route.path.includes(":");

  let status = 0;
  let location = "";
  let bodyText = "";
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    location = response.headers.get("location") ?? "";
    bodyText = (await response.text()).slice(0, 4000);
  } catch (error) {
    return {
      path: route.path,
      url: concrete,
      method: "GET",
      authClass: `page:${classification}`,
      status: 0,
      ok: false,
      reason: `request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const base = {
    path: route.path,
    url: concrete,
    method: "GET",
    authClass: `page:${classification}`,
    status,
  };

  if (status >= 500) {
    return { ...base, ok: false, reason: `server error ${status}` };
  }

  // A static (param-free) page path that 404s is not routed. Parameterized
  // pages legitimately 404 on a missing record, so they are exempt.
  if (status === 404 && !isParameterized) {
    return {
      ...base,
      ok: false,
      reason: "NOT ROUTED — static page path returned 404",
    };
  }

  const redirected = status >= 300 && status < 400;

  if (classification === "protected") {
    // Anchored: an unanchored match would accept a redirect to somewhere like
    // /admin/workspaces-old and call a broken guard "protected".
    if (redirected && /^\/(signin|workspaces)(\/|\?|$)/.test(location)) {
      return { ...base, ok: true, reason: `redirect -> ${location}` };
    }
    if (status === 404) return { ...base, ok: true, reason: "404 (existence hidden)" };
    if (status === 200) {
      return {
        ...base,
        ok: false,
        reason: "AUTH BYPASS — protected page served 200 to an anonymous request",
      };
    }
    return { ...base, ok: true, reason: `non-200 (${status})` };
  }

  if (status === 200 || status === 400 || status === 404 || redirected) {
    return { ...base, ok: true, reason: redirected ? `redirect -> ${location}` : null };
  }
  return { ...base, ok: false, reason: `public page returned ${status}` };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const probes = [];
  for (const entry of API_SURFACE) {
    if (entry.duplicate) continue;
    for (const operation of entry.operations) {
      probes.push({ entry, operation });
    }
  }

  const pageRoutes = INCLUDE_PAGES ? enumeratePageRoutes() : [];

  console.log(
    `[probe-surfaces] base=${BASE_URL} apiProbes=${probes.length} ` +
      `pageProbes=${pageRoutes.length} ` +
      `providerAuth=${STRICT_PROVIDER_AUTH ? "strict" : "relaxed"}`,
  );

  const apiResults = await mapWithConcurrency(probes, 8, ({ entry, operation }) =>
    probe(entry, operation),
  );
  const pageResults = await mapWithConcurrency(pageRoutes, 8, (route) =>
    probePage(route),
  );
  const results = [...apiResults, ...pageResults];

  const failures = results.filter((r) => !r.ok);
  const unrouted = failures.filter((r) => r.reason?.startsWith("NOT ROUTED"));

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
    console.log(`[probe-surfaces] wrote ${JSON_OUT}`);
  }

  if (unrouted.length > 0) {
    console.error(`\nUNREACHABLE ROUTES (${unrouted.length}) — inventory says they exist:`);
    for (const r of unrouted) {
      console.error(`  ${r.method} ${r.path}  ->  ${r.status}`);
    }
  }

  const contractFailures = failures.filter((r) => !r.reason?.startsWith("NOT ROUTED"));
  if (contractFailures.length > 0) {
    console.error(`\nCONTRACT FAILURES (${contractFailures.length}):`);
    for (const r of contractFailures) {
      console.error(
        `  ${r.method} ${r.path} [${r.authClass}] -> ${r.status}: ${r.reason}`,
      );
    }
  }

  // Report what was actually covered. A green run means nothing if the
  // classifier quietly decided every page was public.
  const coverage = {};
  for (const r of results) {
    coverage[r.authClass] = (coverage[r.authClass] ?? 0) + 1;
  }
  console.log("\n[probe-surfaces] coverage by declared class:");
  for (const [cls, count] of Object.entries(coverage).sort()) {
    console.log(`  ${String(count).padStart(4)}  ${cls}`);
  }
  if (INCLUDE_PAGES && (coverage["page:protected"] ?? 0) === 0) {
    console.error(
      "\nFAIL: page probing found zero protected routes — the classifier is broken.",
    );
    process.exit(1);
  }

  const passed = results.length - failures.length;
  console.log(
    `\n[probe-surfaces] ${passed}/${results.length} probes OK` +
      (failures.length > 0 ? `, ${failures.length} FAILED` : ""),
  );

  process.exit(failures.length > 0 ? 1 : 0);
}

main();
