#!/usr/bin/env node
/**
 * Handler strictness gate (ratchet COMPLETE — hard fail).
 *
 * Every route `action`/`loader` must be defined through the handler factory
 * (`defineAction`/`defineLoader` in app/lib/handler.server.ts) so auth, input
 * validation, error mapping, and side-effect declaration are centralized and
 * inventoriable — see docs/handler-strictness.md.
 *
 * History: 272 hand-written handlers were grandfathered in a per-file baseline
 * and migrated down to zero. The baseline is gone; ANY raw (non-factory)
 * handler now fails this gate outright.
 *
 * Facet cross-check: a `sideEffects` declaration must not LIE. If a route
 * module calls an unambiguous side-effect API, the matching facet must appear
 * in one of the module's declarations. Grounded in a real finding: the retired
 * verify-audio-session action declared ["none"] while instantiating a
 * workspace Twilio client with no auth strategy — the declaration hid exactly
 * what the inventory exists to expose. Signals are deliberately narrow (call
 * sites, not imports) so the gate stays quiet; TwiML building is pure response
 * construction and is NOT a signal.
 *
 * Credit facet (BIDIRECTIONAL): the "credit" facet is checked in both
 * directions against the route-level credit-write signals below, which cover
 * synchronous ledger paths (direct inserts, Stripe confirm/poll, number
 * purchase, workspace welcome grant, un-skipped call-status billing) AND
 * asynchronous ones (worker billing job enqueues). A route matching a write
 * signal MUST declare "credit"; a route declaring "credit" MUST match a write
 * signal. Balance reads (getWorkspaceCreditsBalance / credit-floor checks) are
 * deliberately NOT signals — gating on balance is not a ledger write.
 * Grounded in a real audit (2026-07-17): 6 routes could mutate the ledger
 * without declaring credit; 2 SMS send routes declared credit while only
 * reading balances. The gate also emits docs/credit-handler-inventory.md;
 * ci:local's final `git diff --exit-code` catches a stale inventory.
 *
 * TwiML seam (ratchet COMPLETE — hard fail, baseline 0): app/lib/twilio-
 * twiml.server.ts is the only file allowed to construct a Twilio TwiML
 * VoiceResponse (`new Twilio.twiml.VoiceResponse()`) or reference its type
 * (`Twilio.twiml.VoiceResponse`). Before #1243 (E3), 16 route files each
 * built one inline, and ~14 test files hand-rolled fake VoiceResponse
 * classes to test them — a string format ("pause:5|dial:+1555...") that
 * existed nowhere in production. Every call site now goes through
 * createVoiceResponse()/TwimlResponse from that module instead, so tests
 * assert on real serialized XML. Scoped to app/ (not scripts/, test/, or
 * worker/) since that is where TwiML gets built.
 *
 * Capability facet (BIDIRECTIONAL, ratcheted): a `capability` on an
 * API_SURFACE operation must be the capability the route actually enforces.
 * Unlike `sideEffects` there is no separate declaration to compare against —
 * the capability-carrying auth strategies brand themselves with the id they
 * enforce, so the strategy call site IS the declaration. See
 * scripts/lib/capability-linkage.mjs for the two directions and
 * scripts/capability-baseline.json for the hand-rolled preambles that still
 * enforce a capability without that link (ratcheting to zero via #1242 D3).
 *
 * Usage:
 *   node scripts/check-handlers.mjs
 *   node scripts/check-handlers.mjs --update-capability-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeCapabilityLinkage } from "./lib/capability-linkage.mjs";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "app");
const ROUTES_DIR = path.join(ROOT, "app", "routes");
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];
const CREDIT_INVENTORY_PATH = path.join(ROOT, "docs", "credit-handler-inventory.md");
const TWIML_SEAM_PATH = path.join(ROOT, "app", "lib", "twilio-twiml.server.ts");
const TWIML_LEAK_RE = /new\s+Twilio\.twiml\.|\.twiml\.VoiceResponse\b/;
const CAPABILITY_BASELINE_PATH = path.join(ROOT, "scripts", "capability-baseline.json");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), out);
    else if (/\.(tsx|ts)$/.test(e.name)) {
      const rel = path.relative(ROOT, path.join(dir, e.name));
      if (!SKIP_FILE.some((re) => re.test(rel))) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/**
 * Files under app/ (excluding the seam module itself) that construct a
 * Twilio TwiML VoiceResponse directly or reference its SDK type, instead of
 * going through app/lib/twilio-twiml.server.ts's createVoiceResponse()/
 * TwimlResponse. Baseline is 0 as of #1243 (E3) — any hit is a regression.
 */
function twimlLeaks() {
  const leaks = [];
  for (const file of walk(APP_DIR).sort()) {
    if (file === TWIML_SEAM_PATH) continue;
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    const hitLines = [];
    lines.forEach((line, i) => {
      if (TWIML_LEAK_RE.test(line)) hitLines.push(i + 1);
    });
    if (hitLines.length > 0) {
      const rel = path.relative(ROOT, file);
      leaks.push(
        `  ${rel}: line ${hitLines.join(", ")} touches Twilio.twiml.VoiceResponse directly — use createVoiceResponse()/TwimlResponse from app/lib/twilio-twiml.server.ts instead`,
      );
    }
  }
  return leaks;
}

/** Raw (non-factory) handlers in a file: which of action/loader bypass the factory. */
function rawHandlers(src) {
  const raw = [];
  for (const kw of ["action", "loader"]) {
    const exported =
      new RegExp(`export\\s+const\\s+${kw}\\s*[=:]`).test(src) ||
      new RegExp(`export\\s+async\\s+function\\s+${kw}\\b`).test(src) ||
      new RegExp(`export\\s+function\\s+${kw}\\b`).test(src);
    if (!exported) continue;
    const governed =
      new RegExp(`export\\s+const\\s+${kw}\\s*=\\s*define(Action|Loader)\\b`).test(src) ||
      new RegExp(
        `export\\s+const\\s+${kw}\\s*=\\s*defineDataPlaneListLoader\\b`,
      ).test(src);
    if (!governed) raw.push(kw);
  }
  return raw;
}

/**
 * Unambiguous side-effect call signals → the facet each one requires.
 * Keep these narrow: a false positive here trains people to over-declare.
 * (One-directional: signal present → facet required. The credit facet has its
 * own bidirectional check below.)
 */
const FACET_SIGNALS = [
  {
    facet: "twilio",
    satisfiedBy: /"twilio"/,
    signals: [/\bcreateWorkspaceTwilioInstance\s*\(/, /\bwithTwilioRetry\s*\(/],
  },
  {
    facet: "db-write",
    satisfiedBy: /"(db-write|credit)"/,
    signals: [
      /\btdb\.\w+\.(insert|insertMany|update|delete)\s*\(/,
      /\brpc(Create|Update|Dequeue|Apply|Insert|Delete)\w*\s*\(/,
      /\b(insert|update|delete)\w*ForWorkspace\s*\(/,
    ],
  },
];

function facetViolations(src) {
  const declarations = [...src.matchAll(/sideEffects:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
  if (declarations.length === 0) return [];
  const combined = declarations.join(",");
  const out = [];
  for (const { facet, satisfiedBy, signals } of FACET_SIGNALS) {
    if (satisfiedBy.test(combined)) continue;
    const hit = signals.find((re) => re.test(src));
    if (hit) out.push(`uses ${String(hit)} but no declaration includes "${facet}"`);
  }
  return out;
}

/**
 * `processCallStatusWebhook(...)` bills terminal calls synchronously UNLESS
 * the call site passes `skipBilling: true`. Scan each call's argument window.
 */
function hasSyncCallBilling(src) {
  const re = /processCallStatusWebhook\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const window = src.slice(m.index, m.index + 400);
    if (!/skipBilling\s*:\s*true/.test(window)) return true;
  }
  return false;
}

/**
 * Route-level signals that a handler can cause a ledger write (sync in the
 * request, or async via a worker billing job it enqueues). Bidirectional with
 * the "credit" facet. Call sites / job-type constants only — never imports of
 * read helpers.
 */
const CREDIT_WRITE_SIGNALS = [
  {
    id: "direct-ledger-insert",
    kind: "sync",
    matches: (src) => /\binsertTransactionHistoryIdempotent\s*\(/.test(src),
  },
  {
    id: "direct-debit-math",
    kind: "sync",
    matches: (src) => /\bdebitAmountFromCredits\s*\(/.test(src),
  },
  {
    id: "stripe-confirm-or-poll",
    kind: "sync",
    matches: (src) =>
      /\b(confirmStripeCheckoutSessionForRedirect|pollBillingCheckoutSession)\s*\(/.test(src),
  },
  {
    id: "number-purchase",
    kind: "sync",
    matches: (src) => /\bpurchaseWorkspaceNumber\s*\(/.test(src),
  },
  {
    id: "workspace-create-welcome-grant",
    kind: "sync",
    matches: (src) => /\b(createNewWorkspace|createWorkspaceForUser)\s*\(/.test(src),
  },
  {
    id: "sync-call-billing",
    kind: "sync",
    matches: hasSyncCallBilling,
  },
  {
    id: "async-call-billing",
    kind: "async",
    matches: (src) => /\bCALL_STATUS_SIDE_EFFECTS_JOB_TYPE\b/.test(src),
  },
  {
    id: "async-sms-billing",
    kind: "async",
    matches: (src) => /\bSMS_STATUS_SIDE_EFFECTS_JOB_TYPE\b/.test(src),
  },
  {
    id: "async-rental-billing",
    kind: "async",
    matches: (src) => /["']number_rental_billing["']/.test(src),
  },
];

/** `sideEffects: [...]` plus helper-forwarded `extraSideEffects: [...]` literals. */
const DECLARATION_RE = /(?:extraSideEffects|sideEffects):\s*\[([^\]]*)\]/g;

/** Bidirectional credit facet check for a governed route module. */
function creditViolations(src) {
  const isRouteModule =
    /=\s*define(Action|Loader)\b/.test(src) || /sideEffects:\s*\[/.test(src);
  if (!isRouteModule) return { violations: [], matched: [] };

  const declarations = [...src.matchAll(DECLARATION_RE)].map((m) => m[1]);
  const declaresCredit = /"credit"/.test(declarations.join(","));
  const matched = CREDIT_WRITE_SIGNALS.filter((s) => s.matches(src));

  const violations = [];
  if (matched.length > 0 && !declaresCredit) {
    violations.push(
      `credit-write signal(s) [${matched.map((s) => s.id).join(", ")}] but no declaration includes "credit"`,
    );
  }
  if (declaresCredit && matched.length === 0) {
    violations.push(
      'declares "credit" but matches no credit-write signal (balance reads alone do not qualify)',
    );
  }
  return { violations, matched };
}

function writeCreditInventory(rows) {
  const lines = [
    "# Credit handler inventory",
    "",
    "> Generated by `npm run check:handlers`. Do not edit by hand.",
    "> Every route module that can cause a workspace-credit ledger mutation —",
    "> synchronously in the request or asynchronously via a worker billing job —",
    "> appears here with the write signal(s) that prove it. The `credit` facet in",
    "> `sideEffects` is enforced bidirectionally against these signals; see",
    "> [handler-strictness.md](./handler-strictness.md).",
    "",
    `**${rows.length}** route modules can touch the credit ledger.`,
    "",
    "| Route module | Declared sideEffects | Write signals | Timing |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| \`${r.rel}\` | ${r.declared} | ${r.signals.join(", ")} | ${r.timing} |`,
    ),
    "",
  ];
  fs.writeFileSync(CREDIT_INVENTORY_PATH, lines.join("\n"));
}

/**
 * Capability cross-check (self-contained section; all logic lives in
 * scripts/lib/capability-linkage.mjs so this file stays a thin caller).
 * Returns the violation lines to fold into the shared report.
 */
function capabilityViolations() {
  const baseline = fs.existsSync(CAPABILITY_BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(CAPABILITY_BASELINE_PATH, "utf8"))
    : {};
  const result = analyzeCapabilityLinkage({ root: ROOT, baseline });

  if (process.argv.includes("--update-capability-baseline")) {
    fs.writeFileSync(
      CAPABILITY_BASELINE_PATH,
      `${JSON.stringify(result.suggestedBaseline, null, 2)}\n`,
    );
    console.log(
      `Capability baseline written: ${Object.keys(result.suggestedBaseline).length} grandfathered operation(s).`,
    );
    process.exit(0);
  }

  return { lines: result.violations.map((v) => `  ${v}`), stats: result.stats };
}

const violations = [];
const creditRows = [];
for (const file of walk(ROUTES_DIR).sort()) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const raw = rawHandlers(src);
  if (raw.length > 0) {
    violations.push(`  ${rel}: raw ${raw.join(" + ")} (must use defineAction/defineLoader)`);
  }
  for (const v of facetViolations(src)) {
    violations.push(`  ${rel}: ${v}`);
  }
  const credit = creditViolations(src);
  for (const v of credit.violations) {
    violations.push(`  ${rel}: ${v}`);
  }
  if (credit.matched.length > 0) {
    const declarations = [...src.matchAll(DECLARATION_RE)].map((m) =>
      m[1].replaceAll('"', "`").trim(),
    );
    creditRows.push({
      rel,
      declared: declarations.join(" / ") || "(via helper)",
      signals: credit.matched.map((s) => s.id),
      timing: credit.matched.some((s) => s.kind === "sync")
        ? credit.matched.some((s) => s.kind === "async")
          ? "sync + async"
          : "sync"
        : "async (worker)",
    });
  }
}

writeCreditInventory(creditRows);

const twimlViolations = twimlLeaks();
if (twimlViolations.length) {
  violations.push(...twimlViolations);
}

const capability = capabilityViolations();
violations.push(...capability.lines);

if (violations.length) {
  console.error("Handler strictness gate FAILED:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nEvery route action/loader must be defined via defineAction/defineLoader with a\n" +
      "truthful sideEffects declaration (app/lib/handler.server.ts,\n" +
      "docs/handler-strictness.md). The factory migration is complete; there is no\n" +
      "grandfather baseline. The credit facet is bidirectional: routes matching a\n" +
      "credit-write signal must declare \"credit\"; routes declaring \"credit\" must\n" +
      "match a signal. Twilio TwiML VoiceResponse construction/typing must go\n" +
      "through app/lib/twilio-twiml.server.ts — see the TwiML seam note at the top\n" +
      "of this file and #1243 (E3).",
  );
  if (capability.lines.length > 0) {
    console.error(
      "\nThe capability facet is bidirectional too: an API_SURFACE `capability` must\n" +
        "equal the id the route's auth strategy enforces, and nothing may enforce a\n" +
        "capability the surface does not declare. If you migrated a grandfathered\n" +
        "preamble onto a strategy, run `npm run tools:capability:baseline` to ratchet\n" +
        "scripts/capability-baseline.json down.",
    );
  }
  process.exit(1);
}
console.log(
  `Handler gate passed: every route action/loader goes through the handler factory, side-effect declarations match call signals, ${creditRows.length} credit-ledger routes are inventoried, and no file outside app/lib/twilio-twiml.server.ts touches Twilio.twiml.VoiceResponse directly.`,
);
console.log(
  `Capability cross-check passed: ${capability.stats.declared} declared capabilities across ${capability.stats.operations} operations — ${capability.stats.linked} linked to a capability-carrying auth strategy, ${capability.stats.grandfathered} grandfathered preambles (ratcheting to 0).`,
);
