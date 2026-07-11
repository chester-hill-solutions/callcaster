#!/usr/bin/env node
/**
 * Fail if built client assets reference obvious server-only modules/secrets.
 * Run after: npm run build
 */
import fs from "node:fs";
import path from "node:path";

const BUILD_CLIENT = path.join(process.cwd(), "build", "client");

// Runtime-literal markers: these appear verbatim in server code and survive
// minification, so they catch a leak in the built .js chunks themselves — not
// just the source maps. Server-only secret names can never be legitimately
// present in client code (unlike the SDKs: @twilio/voice-sdk and Stripe.js are
// browser-side by design, so bare "twilio"/"stripe" would false-positive).
const FORBIDDEN_RUNTIME = [
  "AUTH_SERVICE_KEY",
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "S3_SECRET_ACCESS_KEY",
  // app/server/db.ts boot error — fires when the server db graph leaks into
  // a client chunk (e.g. a shared lib re-exporting from a *.server module).
  "DATABASE_URL is required",
  // drizzle-orm runtime marker — the ORM has no business in the browser.
  "drizzle:entityKind",
  // credit-ledger RPC name — only ever referenced by server billing code.
  "apply_ledger_entry_and_sync_credits",
];

// Module-specifier markers: erased by Rollup in minified .js chunks, so these
// only fire on source maps (.map). Kept as a second line of defense for
// dev/preview builds that emit maps; the runtime markers above are the ones
// that guard production .js.
const FORBIDDEN_SPECIFIER = [
  "env.server",
  "twilio-webhook.server",
  "throughput-config.server",
  "twilio-sender-class.server",
  "merge-workspace-twilio-data.server",
];

const FORBIDDEN = [...FORBIDDEN_RUNTIME, ...FORBIDDEN_SPECIFIER];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(js|css|map)$/.test(ent.name)) files.push(p);
  }
  return files;
}

const hits = [];
for (const file of walk(BUILD_CLIENT)) {
  if (/manifest-[a-f0-9]+\.js$/i.test(file)) {
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      hits.push({ file: path.relative(process.cwd(), file), needle });
    }
  }
}

if (hits.length) {
  console.error("Client bundle may include server-only references:\n");
  for (const h of hits) {
    console.error(`  ${h.file}: ${h.needle}`);
  }
  process.exit(1);
}

console.log("Client bundle check passed (no forbidden server strings found).");
