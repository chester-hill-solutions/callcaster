#!/usr/bin/env node
/* eslint-env node */
/**
 * Run Playwright E2E against the Railway visual-asset-review deployment.
 *
 * Prerequisites:
 *   railway link + environment visual-asset-review
 *   DATABASE_URL available for seed (via railway run or local export)
 *
 * Usage:
 *   npm run test:e2e:review
 *   E2E_BASE_URL=https://custom.example npm run test:e2e:review
 */
import { spawnSync } from "node:child_process";

const reviewUrl =
  process.env.E2E_BASE_URL ??
  "https://callcaster-review-visual-asset-review.up.railway.app";

console.log(`[e2e-review] target=${reviewUrl}`);

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[e2e-review] seeding review database via railway run…");
run("railway", [
  "run",
  "--",
  "bash",
  "-lc",
  'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run test:e2e:seed',
]);

console.log("[e2e-review] checking review /readyz…");
const ready = await fetch(`${reviewUrl}/readyz`);
if (!ready.ok) {
  console.error(`[e2e-review] review app not ready: ${ready.status}`);
  process.exit(1);
}

console.log("[e2e-review] running Playwright…");
run("npm", ["run", "test:e2e"], {
  ...process.env,
  CI: process.env.CI ?? "true",
  E2E_BASE_URL: reviewUrl,
});

console.log("[e2e-review] complete");
