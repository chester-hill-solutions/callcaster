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
 * Usage:
 *   node scripts/probe-surfaces.mjs --base-url http://127.0.0.1:3100
 *   node scripts/probe-surfaces.mjs --base-url https://... --strict-provider-auth
 *   node scripts/probe-surfaces.mjs --base-url https://... --json report.json
 *
 * Flags:
 *   --strict-provider-auth  Require provider webhooks to reject unsigned
 *                           requests (403). Correct for any environment where
 *                           TWILIO_VALIDATE_WEBHOOKS is not disabled — i.e.
 *                           every deployed environment. The compose E2E
 *                           harness sets it to "false", so omit the flag there
 *                           and reachability is still enforced.
 *   --include-pages         Also probe non-API page routes (GET only).
 */
import { writeFileSync } from "node:fs";

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
const BASE_URL = (
  flagValue("--base-url") ??
  process.env.PROBE_BASE_URL ??
  "http://127.0.0.1:3100"
).replace(/\/$/, "");
const STRICT_PROVIDER_AUTH = args.includes("--strict-provider-auth");
const JSON_OUT = flagValue("--json");
const TIMEOUT_MS = Number(flagValue("--timeout", "15000"));

/**
 * Concrete values for templated params. Seeded IDs exist for most; the rest
 * get syntactically valid synthetic values, where a resource-level 404 is an
 * acceptable answer (it still proves the route matched).
 */
const PARAM_VALUES = {
  workspaceId: WORKSPACES.ready,
  id: WORKSPACES.ready,
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
  selected_id: WORKSPACES.ready,
};

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
        reason: `unsigned provider webhook returned ${status}, expected 403`,
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

  console.log(
    `[probe-surfaces] base=${BASE_URL} probes=${probes.length} ` +
      `providerAuth=${STRICT_PROVIDER_AUTH ? "strict" : "relaxed"}`,
  );

  const results = await mapWithConcurrency(probes, 8, ({ entry, operation }) =>
    probe(entry, operation),
  );

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

  const passed = results.length - failures.length;
  console.log(
    `\n[probe-surfaces] ${passed}/${results.length} probes OK` +
      (failures.length > 0 ? `, ${failures.length} FAILED` : ""),
  );

  process.exit(failures.length > 0 ? 1 : 0);
}

main();
