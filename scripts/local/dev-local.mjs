#!/usr/bin/env node
/* eslint-env node */
/**
 * Local-infra dev entrypoint: loads secrets from `.env`, then forces Postgres +
 * MinIO onto the docker-compose.dev.yml stack so loaders are not paying Railway
 * public-proxy RTT. Does not modify `.env`.
 *
 * Usage: npm run dev:local
 *
 * Prerequisites:
 *   docker compose -f docker-compose.dev.yml up -d postgres minio inbucket
 *   DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster \
 *     node scripts/e2e/bootstrap-compose-db.mjs
 *   DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster \
 *     npm run test:e2e:seed
 */
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRequiredEnv } from "../../app/lib/required-env-keys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const thisFile = fileURLToPath(import.meta.url);

function preferNode22() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 25 || process.env.CALLCASTER_DEV_LOCAL_NODE_OK === "1") {
    return;
  }
  const nvmRoot =
    process.env.NVM_DIR ?? path.join(process.env.HOME ?? "", ".nvm");
  const versionsDir = path.join(nvmRoot, "versions", "node");
  if (!existsSync(versionsDir)) {
    return;
  }
  const node22 = readdirSync(versionsDir)
    .filter((name) => name.startsWith("v22."))
    .sort()
    .at(-1);
  if (!node22) {
    return;
  }
  const nodeBin = path.join(versionsDir, node22, "bin", "node");
  if (!existsSync(nodeBin)) {
    return;
  }
  console.log(
    `[dev:local] re-exec under ${node22} (current ${process.versions.node} breaks Vite SSR Buffer)`,
  );
  const result = spawnSync(nodeBin, [thisFile, ...process.argv.slice(2)], {
    cwd: rootDir,
    env: {
      ...process.env,
      CALLCASTER_DEV_LOCAL_NODE_OK: "1",
      PATH: `${path.dirname(nodeBin)}${path.delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

preferNode22();

const LOCAL_DATABASE_URL =
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

process.env.DATABASE_URL = LOCAL_DATABASE_URL;
process.env.DATABASE_DIRECT_URL = LOCAL_DATABASE_URL;
process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
process.env.S3_REGION = "us-east-1";
process.env.S3_ACCESS_KEY_ID = "callcaster";
process.env.S3_SECRET_ACCESS_KEY = "callcaster-dev-secret";
process.env.S3_BUCKET = "callcaster";
process.env.S3_FORCE_PATH_STYLE = "true";
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}
if (!process.env.BASE_URL) {
  process.env.BASE_URL = "http://localhost:3000";
}
// Local-only defaults when `.env` has Twilio/Stripe but no auth secret
// (secrets usually came from `railway run` before). Matches compose E2E.
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = "local-dev-better-auth-secret-min-32!!";
}
if (!process.env.BETTER_AUTH_URL) {
  process.env.BETTER_AUTH_URL = process.env.BASE_URL;
}

validateRequiredEnv(process.env);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 25) {
  console.warn(
    `[dev:local] Node ${process.versions.node} can break Vite SSR ` +
      "(Buffer undefined → buffer-equal-constant-time). Prefer Node 22 " +
      '(e.g. `nvm use 22` or PATH to ~/.nvm/.../v22.*/bin).',
  );
}

console.log(
  "[dev:local] DATABASE_URL → local compose Postgres @ 127.0.0.1:5433",
);
console.log("[dev:local] S3_* → local MinIO @ 127.0.0.1:9000");
console.log(`[dev:local] node ${process.versions.node}`);

const child = spawn("bunx", ["react-router", "dev"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
