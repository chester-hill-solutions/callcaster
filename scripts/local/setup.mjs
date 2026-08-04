#!/usr/bin/env node
/* eslint-env node */
/**
 * One command from a fresh clone to a running, seeded local app.
 *
 * The README quickstart used to stop after `npm install` + docker + `npm run
 * dev`, which produces an app that FAILS TO BOOT: nothing creates the database
 * schema, so `assertRequiredDbFunctions` exits when
 * `apply_ledger_entry_and_sync_credits` is missing. The real path was nine
 * steps spread across two documents with three silent-failure modes (skip the
 * schema, skip the bucket, skip the seed).
 *
 * Every step here is idempotent — re-running is safe and is the intended way to
 * recover a broken local environment.
 *
 * Usage:
 *   npm run setup            # full setup
 *   npm run setup -- --skip-docker   # services already running elsewhere
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skipDocker = process.argv.includes("--skip-docker");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster";

let step = 0;
function heading(text) {
  step += 1;
  console.log(`\n[setup] ${step}. ${text}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
    env: { ...process.env, DATABASE_URL, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    console.error(
      `\n[setup] FAILED: ${command} ${args.join(" ")}\n` +
        "[setup] Fix the error above and re-run `npm run setup` — every step is idempotent.",
    );
    process.exit(result.status ?? 1);
  }
}

function has(command) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

// ── Preflight ──────────────────────────────────────────────────────────
// Checked up front so you learn about a missing tool now, not four minutes in.
const missing = ["docker", "psql", "bun"].filter(
  (tool) => !(tool === "docker" && skipDocker) && !has(tool),
);
if (missing.length > 0) {
  console.error(
    `[setup] Missing required tool(s): ${missing.join(", ")}\n` +
      "  docker — local Postgres, MinIO and mail (skip with --skip-docker)\n" +
      "  psql   — applies the database schema\n" +
      "  bun    — runs the production server and the job worker",
  );
  process.exit(1);
}

const major = Number(process.versions.node.split(".")[0]);
if (major !== 22) {
  console.warn(
    `[setup] WARNING: Node ${process.versions.node} — this repo pins 22.x and CI uses 22.\n` +
      "[setup] Other majors produce test failures that do not reproduce in CI.",
  );
}

// ── 1. Environment file ────────────────────────────────────────────────
heading("Environment file");
const envPath = path.join(rootDir, ".env");
if (existsSync(envPath)) {
  console.log("[setup] .env already exists — leaving it alone.");
} else {
  copyFileSync(path.join(rootDir, ".env.example"), envPath);
  console.log("[setup] Created .env from .env.example (placeholders are fine locally).");
}

// ── 2. Local services ──────────────────────────────────────────────────
if (skipDocker) {
  console.log("\n[setup] 2. Local services — skipped (--skip-docker)");
  step += 1;
} else {
  heading("Local services (Postgres :5433, MinIO :9000, mail :9002)");
  run("docker", ["compose", "-f", "docker-compose.dev.yml", "up", "-d"]);

  process.stdout.write("[setup] waiting for Postgres");
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    const probe = spawnSync("psql", [DATABASE_URL, "-tAc", "select 1"], {
      stdio: "ignore",
    });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    process.stdout.write(".");
    spawnSync("sleep", ["1"]);
  }
  console.log("");
  if (!ready) {
    console.error("[setup] Postgres did not accept connections. Check `docker compose ps`.");
    process.exit(1);
  }
}

// ── 3. Database schema ─────────────────────────────────────────────────
// The step whose absence made the old quickstart produce a non-booting app.
heading("Database schema");
run("node", ["scripts/e2e/bootstrap-compose-db.mjs"]);

// ── 4. Object storage bucket ───────────────────────────────────────────
heading("Object storage bucket");
run("node", ["scripts/e2e/ensure-minio-bucket.mjs"]);

// ── 5. Seed data ───────────────────────────────────────────────────────
// Without this the app runs against an empty database and nothing says so.
heading("Seed data (test users, workspaces, campaigns)");
run("node", ["scripts/e2e/seed-database.mjs"]);

console.log(
  "\n[setup] Done. Start the app with:\n" +
    "\n    npm run dev\n" +
    "\nSign in with a seeded account (see e2e/fixtures/seed.ts for logins).\n" +
    "For outbound calling you also need a public tunnel — see docs/local-development.md.\n",
);
