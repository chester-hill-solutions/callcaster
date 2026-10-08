#!/usr/bin/env node
/* eslint-env node */
/**
 * Start/stop the local stow bucket service (Docker-free S3). Used by the
 * compose E2E harness, the local dev setup, and the Makefile so nothing pulls
 * an object-storage image — both registries that used to host one now reject
 * anonymous pulls (#1800).
 *
 * Ports/creds default to the same values the rest of the repo uses
 * (S3_ENDPOINT http://127.0.0.1:9000, access `callcaster`, secret
 * `callcaster-dev-secret`) so callers can rely on S3_* env overrides.
 *
 * Usage:
 *   node scripts/e2e/start-stow.mjs --start    # launch detached, wait ready
 *   node scripts/e2e/start-stow.mjs --stop     # kill the recorded pid
 *   node scripts/e2e/start-stow.mjs --foreground  # keep attached (Makefile)
 *   STOW_LAUNCH=disable node scripts/e2e/start-stow.mjs --start  # external bucket
 */
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveStowBinary } from "./ensure-stow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const STOW_DIR = join(rootDir, ".stow");
const PID_FILE = join(STOW_DIR, "stow.pid");
const LOG_FILE = join(STOW_DIR, "stow.log");

const port = process.env.STOW_PORT ?? "9000";
const host = process.env.STOW_HOST ?? "127.0.0.1";
const dataDir = process.env.STOW_DATA_DIR ?? join(STOW_DIR, "data");
const accessKey = process.env.S3_ACCESS_KEY_ID ?? "callcaster";
const secretKey = process.env.S3_SECRET_ACCESS_KEY ?? "callcaster-dev-secret";

const args = process.argv.slice(2);

function createStowArgs() {
  return [
    "serve",
    `--port=${port}`,
    `--host=${host}`,
    `--data-dir=${dataDir}`,
    `--access-key=${accessKey}`,
    `--secret-key=${secretKey}`,
  ];
}

// Matched per line against the whole accumulated buffer, so it needs the `m`
// flag: without it `^` anchors to the start of the buffer, and stow prints
// three banner lines ("stow mode: local", cache policy, write policy) before
// STOW_READY, so the pattern can never match.
const READY_RE = /^STOW_READY endpoint=(\S+) access_key=(\S+) secret_key=(\S+)/m;

async function startDetached() {
  const bin = await resolveStowBinary();
  mkdirSync(STOW_DIR, { recursive: true });

  // stow's stdout/stderr go to a FILE, not a pipe to this process. A detached
  // child that still holds an inherited pipe dies the moment the parent exits:
  // the write end closes, stow takes EPIPE/SIGPIPE on its next log line, and
  // the object store vanishes seconds after reporting ready. Redirecting to a
  // file decouples the daemon's lifetime from this script entirely.
  //
  // The log is also how we read the STOW_READY banner — the definitive
  // readiness signal. An HTTP poll on the shared S3 port would accept ANY S3
  // service answering there (a co-resident MinIO, for instance), so we wait for
  // stow's own banner instead.
  const logFd = openSync(LOG_FILE, "w");
  const child = spawn(bin, createStowArgs(), {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  writeFileSync(PID_FILE, String(child.pid));

  const banner = await waitForBanner(child);
  console.log(`[start-stow] ready at ${banner.endpoint} (pid ${child.pid})`);
  console.log(`[start-stow] log: ${LOG_FILE}`);
}

function readLog() {
  try {
    return readFileSync(LOG_FILE, "utf8");
  } catch {
    return "";
  }
}

function waitForBanner(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let earlyExit = null;
    child.on("exit", (code) => {
      earlyExit = code;
    });

    const fail = (reason) =>
      reject(
        new Error(
          `${reason}\nstow log (${LOG_FILE}):\n${readLog().trim() || "(empty)"}\n` +
            `If this is "server failed to bind", something already holds ` +
            `port ${port} — set STOW_PORT and S3_ENDPOINT to match.`,
        ),
      );

    // Poll the log rather than streaming it: the child owns the fd now, and a
    // short interval keeps this dependency-free.
    const started = Date.now();
    const poll = setInterval(() => {
      const log = readLog();
      const match = log.match(READY_RE);
      if (match) {
        clearInterval(poll);
        // Give stow a beat to finish binding before the caller dials it.
        setTimeout(() => {
          resolve({
            endpoint: match[1],
            accessKeyId: match[2],
            secretAccessKey: match[3],
          });
        }, 100);
        return;
      }
      // A bind failure makes stow exit almost immediately, so this catches the
      // common failure in milliseconds instead of waiting out the timeout.
      if (earlyExit !== null) {
        clearInterval(poll);
        fail(`stow exited (code ${earlyExit}) before signalling ready.`);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        fail(`stow did not emit STOW_READY in ${timeoutMs}ms.`);
      }
    }, 100);
  });
}

async function startForeground() {
  const bin = await resolveStowBinary();
  const child = spawn(bin, createStowArgs(), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

function stop() {
  if (!existsSync(PID_FILE)) {
    console.log("[start-stow] no pidfile — nothing to stop");
    return;
  }
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  console.log(`[start-stow] stopping pid ${pid}`);
  spawnSync("kill", [String(pid)], { stdio: "ignore" });
  rmSync(PID_FILE, { force: true });
}

async function main() {
  if (process.env.STOW_LAUNCH === "disable") {
    console.log("[start-stow] STOW_LAUNCH=disable — using an external bucket service");
    return;
  }
  if (args.includes("--stop")) return stop();
  if (args.includes("--foreground")) return startForeground();
  if (args.includes("--start")) return startDetached();
  throw new Error("usage: start-stow.mjs --start | --stop | --foreground");
}

main().catch((e) => {
  console.error(`[start-stow] ${e?.message ?? e}`);
  process.exit(1);
});