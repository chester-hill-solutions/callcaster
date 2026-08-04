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
 * Usage:
 *   node scripts/check-handlers.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, "app", "routes");
const SKIP_FILE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/];
const CREDIT_INVENTORY_PATH = path.join(ROOT, "docs", "credit-handler-inventory.md");

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

if (violations.length) {
  console.error("Handler strictness gate FAILED:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nEvery route action/loader must be defined via defineAction/defineLoader with a\n" +
      "truthful sideEffects declaration (app/lib/handler.server.ts,\n" +
      "docs/handler-strictness.md). The factory migration is complete; there is no\n" +
      "grandfather baseline. The credit facet is bidirectional: routes matching a\n" +
      "credit-write signal must declare \"credit\"; routes declaring \"credit\" must\n" +
      "match a signal.",
  );
  process.exit(1);
}
console.log(
  `Handler gate passed: every route action/loader goes through the handler factory, side-effect declarations match call signals, and ${creditRows.length} credit-ledger routes are inventoried.`,
);
