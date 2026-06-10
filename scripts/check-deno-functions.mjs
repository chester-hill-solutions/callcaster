#!/usr/bin/env node
/**
 * Type-check Supabase Edge Function shared modules with Deno and run edge tests.
 * Scoped to `_shared/` so CI catches regressions like undeclared identifiers without
 * requiring every function entrypoint to pass strict Deno checking yet.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SHARED_DIR = join(ROOT, "supabase/functions/_shared");
const DENO_CONFIG = join(ROOT, "supabase/functions/deno.json");
const SHARED_RETRY = join(ROOT, "shared/twilio-retry-predicates.ts");
const SHARED_PRICING = join(ROOT, "shared/pricing.ts");

function collectTsFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectTsFiles(fullPath, files);
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [SHARED_RETRY, SHARED_PRICING, ...collectTsFiles(SHARED_DIR)];
console.log(`deno check: ${files.length} shared edge modules`);
execSync(
  `npx deno check --config ${JSON.stringify(DENO_CONFIG)} ${files.map((f) => JSON.stringify(f)).join(" ")}`,
  {
    cwd: ROOT,
    stdio: "inherit",
  },
);

const EDGE_REGRESSION_TESTS = [
  "supabase/functions/__tests__/campaign_dispatch_test.ts",
  "supabase/functions/__tests__/twilio_retry_test.ts",
  "supabase/functions/__tests__/ivr_status_logic_test.ts",
];

console.log(`deno test: ${EDGE_REGRESSION_TESTS.join(", ")}`);
execSync(
  `npx deno test --no-check --config ${JSON.stringify(DENO_CONFIG)} ${EDGE_REGRESSION_TESTS.join(" ")}`,
  {
    cwd: ROOT,
    stdio: "inherit",
  },
);
