/**
 * Mechanical derivation of the API surface core (issue #1242, D4).
 *
 * `API_SURFACE` used to be a 1,760-line hand-maintained literal split across
 * four files. Most of what it said was already written down in the code:
 * the route tree knows the paths and modules, the route shim knows whether a
 * surface has a loader or an action, the handler knows which HTTP methods it
 * answers, and — since D1–D3 — the auth strategy knows which capability it
 * enforces. A hand-maintained copy of derivable facts is a copy that drifts,
 * and the D-lane found it had: see the drift list in the D4 PR body.
 *
 * This module derives that core. It is deliberately conservative: it emits a
 * fact only when the code determines it unambiguously, and otherwise says so
 * (`authClass: null`, `unresolved`) rather than guessing. The editorial
 * remainder — docsGuide, ownerArea, exposure, bodyType, notes — is not
 * derivable and lives in app/lib/api-surface-annotations.ts.
 *
 * WHY authClass IS ONLY PARTLY DERIVED
 * ------------------------------------
 * Auth strategies fall into two groups, and conflating them produces
 * confident lies:
 *
 *  - AUTHORITATIVE strategies fully determine the class. `requireTwilioSignature`
 *    IS the authentication; `dataPlaneSessionMinRoleAuth(minRole)` deliberately
 *    refuses API-key actors and carries its own role floor. Nothing layered on
 *    top can widen these, so the derived class wins outright.
 *
 *  - BASE helpers only establish a floor. `requireJsonAuth` proves "a session",
 *    but the route may then gate on an admin role — sometimes several frames
 *    away in the service layer (`listWorkspaceApiKeys` → `requireMemberManager`).
 *    A route-level analyser cannot see that, so deriving from a base would
 *    silently DOWNGRADE a correct `workspaceAdmin` declaration. For these the
 *    annotation supplies the class and this module supplies a CONSTRAINT: the
 *    set of classes the base makes possible. A declaration outside that set is
 *    drift and fails the gate.
 *
 * The distinction is what keeps the gate honest in both directions: it cannot
 * be satisfied by a declaration the code contradicts, and it cannot invent a
 * weaker truth than the code actually enforces.
 */
import fs from "node:fs";
import path from "node:path";

import {
  groupRouteModulesByPath,
  parseApiRoutesFromReactRouter,
} from "./parse-api-routes.mjs";
import { resolveHandlerModule } from "./capability-linkage.mjs";

export const HANDLER_NAMES = ["loader", "action"];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Strategies that fully determine the auth class. The construct IS the
 * authentication, so a declaration may not disagree with it.
 *
 * Order matters: the first match wins, so the more specific patterns
 * (a min-role argument, a capability constructor) come before the generic
 * ones.
 */
const AUTHORITATIVE_STRATEGIES = [
  {
    id: "dataPlaneCapabilityAuthForResource",
    re: /\bdataPlaneCapabilityAuthForResource\s*\(/,
    authClass: "apiKeyOrSession",
  },
  {
    id: "dataPlaneCapabilityAuthWithParam",
    re: /\bdataPlaneCapabilityAuthWithParam\s*\(/,
    authClass: "apiKeyOrSession",
  },
  {
    id: "dataPlaneCapabilityAuth",
    re: /\bdataPlaneCapabilityAuth\s*\(/,
    authClass: "apiKeyOrSession",
  },
  {
    id: "defineDataPlaneListLoader",
    re: /\bdefineDataPlaneListLoader\s*\(/,
    authClass: "apiKeyOrSession",
  },
  // The role floor is the argument. Admin/Owner is an admin gate; Member and
  // Caller are not (Caller is rank 1 — the floor is a no-op and the real gate
  // is membership).
  {
    id: "dataPlaneSessionMinRoleAuth(admin)",
    re: /\bdataPlaneSessionMinRoleAuth\s*\(\s*MemberRole\.(?:Admin|Owner)\b/,
    authClass: "workspaceAdmin",
  },
  {
    id: "dataPlaneSessionMinRoleAuth",
    re: /\bdataPlaneSessionMinRoleAuth\s*\(/,
    authClass: "session",
  },
  {
    id: "requireSudo",
    re: /\brequireSudo\w*\s*\(/,
    authClass: "internalTrusted",
  },
  {
    id: "requireTwilioEventsSink",
    re: /\brequireTwilioEventsSink\w*\s*\(/,
    authClass: "internalTrusted",
  },
  {
    id: "requireTwilioSignature",
    re: /\brequireTwilioSignature\w*\s*\(/,
    authClass: "twilioSignature",
  },
  {
    id: "stripeSignature",
    re: /\brequireStripeSignature\w*\s*\(|\bconstructStripeEvent\s*\(/,
    authClass: "stripeSignature",
  },
];

/**
 * Helpers that establish a floor but not a ceiling. The value is the set of
 * classes the helper makes possible; a declaration must be one of them.
 */
const BASE_HELPERS = [
  {
    id: "requireDualAuth",
    re: /\brequireDualAuth\s*\(|\bverifyApiKeyOrSession\s*\(/,
    allows: ["apiKeyOrSession", "session", "workspaceAdmin"],
  },
  {
    id: "requireJsonAuth",
    re: /\brequireJsonAuth\s*\(|\bverifyBearerOrSession\s*\(/,
    allows: ["session", "workspaceAdmin"],
  },
  {
    id: "verifyAuth",
    re: /\bverifyAuth\s*\(/,
    allows: ["session", "workspaceAdmin"],
  },
  // Gates on a capability but admits either actor kind.
  {
    id: "requireDataPlaneRouteCapability",
    re: /\brequireDataPlaneRouteCapability\s*\(|\brequireDataPlaneCapability\s*\(/,
    allows: ["apiKeyOrSession", "session", "workspaceAdmin"],
  },
  // Data-plane middleware resolves API-key actors but hands them userId:null,
  // so a preamble that requires userId is session-or-stronger.
  {
    id: "getDataPlaneRouteContext",
    re: /\bgetDataPlaneRouteContext\s*\(/,
    allows: ["session", "workspaceAdmin"],
  },
];

/**
 * `rateLimitedPostAuth` is a MODIFIER, not an auth class. It returns
 * `Response | undefined`, so the idiom
 *   auth: async (args) => (await rateLimitedPostAuth(s)(args)) ?? requireJsonAuth(args.request)
 * short-circuits on rejection and FALLS THROUGH on success — the class comes
 * from the right-hand side. Only when it stands alone is the surface public.
 */
const RATE_LIMITED = /\brateLimitedPostAuth\s*\(/;
const NULLISH_FALLTHROUGH = /\)\s*\?\?\s*/;

/** Dual auth accepted, then api-key actors rejected => effectively session. */
const APIKEY_REJECTED = /getDualAuthUser\s*\(/;
/** ...unless an `authType === "api_key"` branch admits them first. */
const APIKEY_ADMITTED = /authType\s*===\s*["']api_key["']/;

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** Which of loader/action a route module exposes, directly or by re-export. */
export function shimHandlerExports(src) {
  const found = new Set();
  for (const name of HANDLER_NAMES) {
    if (
      new RegExp(
        `export\\s+(?:const|let|async\\s+function|function)\\s+${name}\\b`,
      ).test(src)
    ) {
      found.add(name);
    }
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*"[^"]+"/g)) {
    for (const raw of m[1].split(",")) {
      const exported = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (HANDLER_NAMES.includes(exported)) found.add(exported);
    }
  }
  return [...found].sort();
}

/** Source slice from `export const <name> =` up to the next top-level export. */
function exportRegion(src, name) {
  const m = src.match(
    new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${name}\\b`),
  );
  if (!m) return null;
  const from = src.slice(m.index);
  const next = from.slice(1).search(/\nexport\s/);
  return next === -1 ? from : from.slice(0, next + 1);
}

/** The value of the `auth:` property, to the matching top-level comma. */
function authExpression(region) {
  const m = region.match(/\bauth:\s*/);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < region.length; i++) {
    const c = region[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return region.slice(start, i);
      depth--;
    } else if (c === "," && depth === 0) return region.slice(start, i);
  }
  return region.slice(start);
}

/** Inline a locally-declared strategy referenced by bare identifier. */
function expandLocalAlias(src, expr) {
  const id = expr.trim().match(/^([A-Za-z_$][\w$]*)$/);
  if (!id) return expr;
  const decl = src.match(
    new RegExp(
      `(?:const|let|var)\\s+${id[1]}\\s*=|(?:async\\s+)?function\\s+${id[1]}\\s*\\(`,
    ),
  );
  if (!decl) return expr;
  const from = src.slice(decl.index);
  const next = from.slice(1).search(/\n(?:export\s|const\s|function\s|async\s+function\s)/);
  return `${expr}\n${next === -1 ? from : from.slice(0, next + 1)}`;
}

/**
 * Classify one handler's authentication.
 *
 * @returns {{ authClass: string|null, allows: string[]|null, via: string, rateLimited: boolean }}
 *   `authClass` non-null  → authoritative; a declaration must equal it.
 *   `allows` non-null     → base helper; a declaration must be in the set.
 *   both null             → unresolved; the declaration is unconstrained and
 *                           must carry a justification in the annotations.
 */
export function classifyHandlerAuth(src, handlerName) {
  const region = exportRegion(src, handlerName);
  if (!region) {
    return { authClass: null, allows: null, via: "no-export-region", rateLimited: false };
  }

  // defineDataPlaneListLoader IS the handler factory, not an `auth:` value.
  if (/=\s*defineDataPlaneListLoader\s*\(/.test(region)) {
    return {
      authClass: "apiKeyOrSession",
      allows: null,
      via: "defineDataPlaneListLoader",
      rateLimited: false,
    };
  }

  const expr = authExpression(region);
  if (expr === null) {
    return { authClass: null, allows: null, via: "no-auth-strategy", rateLimited: false };
  }

  const text = expandLocalAlias(src, expr);
  const rateLimited = RATE_LIMITED.test(text);
  // A rate limiter with a `??` fallthrough delegates; without one it stands
  // alone and the surface really is public.
  if (rateLimited && !NULLISH_FALLTHROUGH.test(text)) {
    return { authClass: "publicForm", allows: null, via: "rateLimitedPostAuth", rateLimited: true };
  }

  for (const s of AUTHORITATIVE_STRATEGIES) {
    if (s.re.test(text)) {
      return { authClass: s.authClass, allows: null, via: s.id, rateLimited };
    }
  }

  for (const b of BASE_HELPERS) {
    if (!b.re.test(text)) continue;
    let allows = b.allows;
    // requireDualAuth + a getDualAuthUser null-rejection is session-only —
    // unless an `authType === "api_key"` branch admits keys before it.
    if (
      b.id === "requireDualAuth" &&
      APIKEY_REJECTED.test(region) &&
      !APIKEY_ADMITTED.test(region)
    ) {
      allows = ["session", "workspaceAdmin"];
    }
    return { authClass: null, allows, via: b.id, rateLimited };
  }

  return { authClass: null, allows: null, via: "unrecognised", rateLimited };
}

/**
 * HTTP methods a handler answers. Loaders are GET by construction; an action's
 * methods come from its own branching, and an action that never branches is a
 * POST.
 *
 * Taking the branches as the complete set relies on these handlers ending in a
 * 405 rather than falling through — an action that branched on PATCH/DELETE and
 * then quietly POSTed would be under-reported. No route in the tree does that
 * (checked against all 173 handlers during the D4 migration), and the shim
 * export list plus the 405 branches are the two parallel encodings of the same
 * fact, so a new one would show up as a mismatch here rather than pass silently.
 */
export function deriveMethods(src, handlerName) {
  if (handlerName === "loader") return ["GET"];
  const found = new Set();
  for (const m of src.matchAll(/\bmethod\s*(?:===|!==|==)\s*["']([A-Z]+)["']/g)) {
    if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
  }
  for (const m of src.matchAll(/case\s+["']([A-Z]+)["']\s*:/g)) {
    if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
  }
  // A loader serves GET; an action never does.
  found.delete("GET");
  const ordered = HTTP_METHODS.filter((m) => found.has(m));
  return ordered.length ? ordered : ["POST"];
}

/** The capability an auth strategy brands itself with, if any. */
function derivedCapability(src, handlerName) {
  const region = exportRegion(src, handlerName);
  if (!region) return undefined;
  if (/=\s*defineDataPlaneListLoader\s*\(/.test(region)) {
    return region.match(/capability:\s*"([^"]+)"/)?.[1];
  }
  const linked =
    "dataPlaneCapabilityAuthForResource|dataPlaneCapabilityAuthWithParam|dataPlaneCapabilityAuth";
  const direct = region.match(new RegExp(`auth:\\s*(?:${linked})\\(\\s*"([^"]+)"`));
  if (direct) return direct[1];
  const alias = region.match(/auth:\s*([A-Za-z_$][\w$]*)\s*,/)?.[1];
  if (!alias) return undefined;
  return (
    src.match(
      new RegExp(`(?:const|let)\\s+${alias}\\s*=\\s*(?:${linked})\\(\\s*"([^"]+)"`),
    )?.[1] ?? undefined
  );
}

/**
 * The D3 capability baseline: operations whose capability is enforced by a
 * body-resolved preamble rather than a capability-carrying strategy, so the
 * strategy call site does not carry the id. The generator does NOT guess these
 * — it reads the same file `check:handlers` ratchets against and marks each
 * one `capabilitySource: "baseline"`, so a reader can see at a glance which
 * capabilities are mechanically linked and which are still grandfathered.
 */
export function readCapabilityBaseline(root) {
  const file = path.join(root, "scripts", "capability-baseline.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/**
 * Derive every callable API surface from the route tree.
 *
 * A registered route module that exports neither a loader nor an action is
 * not a callable surface and produces no entry — that is how the data-plane
 * layout at `/api/workspaces/:workspaceId` stops appearing as a phantom GET.
 *
 * @param {{ root: string, routes?: {path: string, routeModule: string}[] }} args
 */
export function deriveApiSurfaceCores({ root, routes }) {
  const registered = routes ?? parseApiRoutesFromReactRouter({ cwd: root });
  const byPath = groupRouteModulesByPath(registered);
  const baseline = readCapabilityBaseline(root);

  const cores = [];
  const diagnostics = [];
  const skipped = [];

  for (const [routePath, modules] of [...byPath.entries()].sort()) {
    const fullPath = routePath.startsWith("/") ? routePath : `/${routePath}`;
    for (const routeModule of [...modules].sort()) {
      const abs = path.join(root, routeModule);
      const shim = readIfExists(abs);
      if (shim === null) {
        diagnostics.push(`${fullPath}: route module ${routeModule} does not exist`);
        continue;
      }

      const handlers = shimHandlerExports(shim);
      if (handlers.length === 0) {
        skipped.push({ path: fullPath, routeModule, reason: "no loader/action export" });
        continue;
      }

      const operations = [];
      const authFacts = [];
      for (const handlerName of handlers) {
        const handlerModule = resolveHandlerModule(abs, handlerName);
        if (!handlerModule) {
          diagnostics.push(
            `${fullPath}: ${routeModule} re-exports \`${handlerName}\` but no defining module could be resolved`,
          );
          continue;
        }
        const src = fs.readFileSync(handlerModule, "utf8");
        const rel = path.relative(root, handlerModule);
        const linkedCap = derivedCapability(src, handlerName);
        for (const method of deriveMethods(src, handlerName)) {
          const grandfathered = baseline[`${method} ${fullPath}`];
          const op = { method, handler: handlerName };
          if (linkedCap) {
            op.capability = linkedCap;
          } else if (grandfathered) {
            op.capability = grandfathered;
            op.capabilitySource = "baseline";
          }
          operations.push(op);
        }
        authFacts.push({ handler: handlerName, module: rel, ...classifyHandlerAuth(src, handlerName) });
      }

      if (operations.length === 0) {
        skipped.push({ path: fullPath, routeModule, reason: "no resolvable handler" });
        continue;
      }

      const auth = resolveEntryAuth(authFacts);
      cores.push({
        path: fullPath,
        routeModule,
        authClass: auth.authClass,
        authVia: auth.via,
        operations,
        // Analysis-only, not part of the committed artifact: the classes a base
        // helper leaves open, for the gate to constrain the annotation against.
        authAllows: auth.allows,
        authFacts,
      });
    }
  }

  return { cores, diagnostics, skipped, registered };
}

/**
 * Collapse per-handler auth facts into one entry-level verdict.
 *
 * `authClass` is a per-ENTRY field but auth is enforced per-METHOD, and some
 * routes genuinely differ (`/api/workspaces/:workspaceId` GET is API-key
 * capable while its PATCH is session-only). The entry-level class is the most
 * PERMISSIVE handler's, because the field's job in the published spec is to
 * tell an integrator what is sufficient to reach the surface at all.
 */
function resolveEntryAuth(authFacts) {
  const PERMISSIVENESS = [
    "publicForm",
    "apiKeyOrSession",
    "twilioSignature",
    "stripeSignature",
    "session",
    "workspaceAdmin",
    "internalTrusted",
  ];
  const rank = (c) => {
    const i = PERMISSIVENESS.indexOf(c);
    return i === -1 ? PERMISSIVENESS.length : i;
  };

  const authoritative = authFacts.filter((f) => f.authClass);
  if (authoritative.length === authFacts.length && authFacts.length > 0) {
    const best = authoritative.reduce((a, b) => (rank(a.authClass) <= rank(b.authClass) ? a : b));
    return {
      authClass: best.authClass,
      allows: null,
      via: authoritative.map((f) => `${f.handler}:${f.via}`).join(" + "),
    };
  }

  // An unresolved handler means the entry's auth is genuinely unknown to this
  // analyser. Constraining the entry on its OTHER handlers would manufacture a
  // ceiling the code never established, so the entry goes unconstrained and the
  // annotation must justify itself instead.
  if (authFacts.some((f) => !f.authClass && !f.allows)) {
    return {
      authClass: null,
      allows: null,
      via: authFacts.map((f) => `${f.handler}:${f.via}`).join(" + "),
    };
  }

  // Mixed or base-only: the entry is constrained, not determined. The union of
  // what each handler permits is what a declaration may claim.
  const allows = new Set();
  for (const f of authFacts) {
    if (f.authClass) allows.add(f.authClass);
    else if (f.allows) for (const a of f.allows) allows.add(a);
  }
  return {
    authClass: null,
    allows: allows.size ? PERMISSIVENESS.filter((c) => allows.has(c)) : null,
    via: authFacts.map((f) => `${f.handler}:${f.via}`).join(" + "),
  };
}
