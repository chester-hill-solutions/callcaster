#!/usr/bin/env node
/* eslint-env node */
/**
 * G4 compose-first E2E: docker-compose Postgres + Drizzle bootstrap + seed + Playwright.
 *
 * Usage:
 *   npm run test:e2e:compose
 *
 * Optional:
 *   E2E_SKIP_BOOTSTRAP=1  — skip psql migrate (DB already bootstrapped)
 *   E2E_SKIP_BUILD=1      — skip npm run build
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalTarget } from "../lib/local-target-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const composeFile = path.join(rootDir, "docker-compose.dev.yml");
const e2ePort = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

assertLocalTarget(databaseUrl, "DATABASE_URL");

const e2eS3Env = {
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "callcaster",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "callcaster-dev-secret",
  S3_BUCKET: process.env.S3_BUCKET ?? "callcaster",
};
assertLocalTarget(e2eS3Env.S3_ENDPOINT, "S3_ENDPOINT");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runAsync(command, args, env = process.env) {
  return spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
}

console.log("[e2e-compose] starting Postgres + MinIO via docker compose…");
run("docker", ["compose", "-f", composeFile, "up", "-d", "postgres", "minio", "inbucket"]);

console.log("[e2e-compose] waiting for Postgres…");
await (async function waitForPostgres() {
  // The official postgres image starts a temporary server for initdb, then
  // RESTARTS the real server — so an early host connection to the mapped port
  // gets "server closed the connection unexpectedly". Probe the SAME host path
  // the bootstrap uses (psql → DATABASE_URL) and require two consecutive
  // successes so a mid-restart drop can't be mistaken for readiness.
  let consecutive = 0;
  for (let i = 0; i < 90; i += 1) {
    const probe = spawnSync("psql", [databaseUrl, "-tAc", "select 1"], {
      stdio: "ignore",
    });
    if (probe.status === 0) {
      consecutive += 1;
      if (consecutive >= 2) return;
    } else {
      consecutive = 0;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Postgres did not become ready");
})();
console.log("[e2e-compose] Postgres ready");

run("node", ["scripts/e2e/ensure-minio-bucket.mjs"], {
  env: { ...process.env, ...e2eS3Env },
});

if (process.env.E2E_SKIP_BOOTSTRAP !== "1") {
  console.log("[e2e-compose] bootstrapping schema…");
  run("node", ["scripts/e2e/bootstrap-compose-db.mjs"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

// The real-Postgres test tier. Every other ledger test mocks the db client and
// therefore cannot see the plpgsql in
// apply_ledger_entry_and_sync_credits (ADR-0003/0006); these run it. Placed
// before the seed and the build so a broken ledger fails in seconds rather than
// after a full app build and Playwright run.
console.log("[e2e-compose] running integration-db suites…");
run("npm", ["run", "test:integration-db"], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

console.log("[e2e-compose] seeding E2E data…");
run("npm", ["run", "test:e2e:seed"], {
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

console.log("[e2e-compose] seeding object storage fixtures…");
run("node", ["scripts/e2e/seed-object-storage.mjs"], {
  env: { ...process.env, DATABASE_URL: databaseUrl, ...e2eS3Env },
});

if (process.env.E2E_SKIP_BUILD !== "1") {
  console.log("[e2e-compose] building app…");
  run("npm", ["run", "build"], {
    env: {
      ...process.env,
      BASE_URL: baseURL,
      TWILIO_VALIDATE_WEBHOOKS: "false",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_placeholder",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_placeholder",
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_e2e_placeholder",
      TWILIO_SID: process.env.TWILIO_SID ?? "AC_e2e_test_sid_placeholder",
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "e2e_twilio_auth_token",
      TWILIO_APP_SID: process.env.TWILIO_APP_SID ?? "AP_e2e_test_app_sid",
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? "+15555501001",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-better-auth-secret-min-32-chars!!",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? baseURL,
      ...e2eS3Env,
    },
  });
}

const serverEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  BASE_URL: baseURL,
  E2E_BASE_URL: baseURL,
  // Marks this as the E2E harness: relaxes prod-only boot guards
  // (localhost BASE_URL check, 2FA-bypass refusal).
  E2E_TEST: "1",
  SIGNUP_OPEN: process.env.SIGNUP_OPEN ?? "true",
  PORT: e2ePort,
  TWILIO_VALIDATE_WEBHOOKS: "false",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_placeholder",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_placeholder",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_e2e_placeholder",
  TWILIO_SID: process.env.TWILIO_SID ?? "AC_e2e_test_sid_placeholder",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "e2e_twilio_auth_token",
  TWILIO_APP_SID: process.env.TWILIO_APP_SID ?? "AP_e2e_test_app_sid",
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? "+15555501001",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-better-auth-secret-min-32-chars!!",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? baseURL,
  E2E_DISABLE_2FA_ENFORCEMENT: process.env.E2E_DISABLE_2FA_ENFORCEMENT ?? "1",
  // The suite signs in far more often than a human would; the strict
  // credential buckets are unit-tested instead (test/auth-*rate-limit*).
  E2E_DISABLE_AUTH_RATE_LIMIT: process.env.E2E_DISABLE_AUTH_RATE_LIMIT ?? "1",
  ...e2eS3Env,
};

function freePort(port) {
  const result = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
  const pids = (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const pid of pids) {
    console.log(`[e2e-compose] freeing port ${port}: killing pid ${pid}`);
    spawnSync("kill", ["-9", pid], { stdio: "ignore" });
  }
}

console.log(`[e2e-compose] starting server on ${baseURL}…`);
freePort(e2ePort);
const server = runAsync("bun", ["run", "./server/bun.ts"], serverEnv);
server.on("exit", (code, signal) => {
  if (code != null && code !== 0) {
    console.error(`[e2e-compose] server exited early code=${code} signal=${signal ?? ""}`);
  }
});

// Queued jobs (audience_upload, exports, dispatch) only run if a worker is
// polling. Without one, "processing" states never resolve and specs cannot
// cover job completion — which is how the upload dead-letter bug shipped.
console.log("[e2e-compose] starting job worker…");
const worker = runAsync("bun", ["run", "./worker/index.ts"], serverEnv);
worker.on("exit", (code, signal) => {
  if (code != null && code !== 0) {
    console.error(`[e2e-compose] worker exited early code=${code} signal=${signal ?? ""}`);
  }
});

async function waitForReady(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${url}/readyz`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server not ready at ${url}/readyz`);
}

let exitCode = 0;
try {
  await waitForReady(baseURL);

  // Surface contract probe: asserts every inventoried endpoint is actually
  // routed (unit tests import handlers directly and cannot catch a routing
  // failure) and that no-credential requests match the declared authClass.
  // Provider-auth stays relaxed here because this harness sets
  // TWILIO_VALIDATE_WEBHOOKS=false; deployed environments run it with
  // --strict-provider-auth. Uses spawnSync + throw rather than run(), whose
  // process.exit would skip the finally block and orphan bun children.
  console.log("[e2e-compose] probing surface contracts…");
  const probe = spawnSync(
    "npx",
    ["tsx", "--tsconfig", "tsconfig.json", "scripts/probe-surfaces.mjs", baseURL],
    { cwd: rootDir, stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } },
  );
  if (probe.status !== 0) {
    throw new Error("surface contract probe failed");
  }

  console.log("[e2e-compose] running Playwright…");
  run("npx", ["playwright", "install", "chromium"], { env: process.env });
  run("npm", ["run", "test:e2e"], {
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      E2E_BASE_URL: baseURL,
      DATABASE_URL: databaseUrl,
    },
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  // SIGTERM first for graceful shutdown, but don't trust it — an ignored
  // signal here orphans bun children that keep ports and stdio pipes open.
  server.kill("SIGTERM");
  worker.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 3000));
  for (const child of [server, worker]) {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGKILL");
    }
  }
  process.exit(exitCode);
}
