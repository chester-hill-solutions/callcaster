#!/usr/bin/env node
/* eslint-env node */

import "dotenv/config";

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const APP_PORT = process.env.PORT ?? "3000";
const BUILD_PATH = path.resolve("build/server/index.js");
const BUILD_DIR = path.dirname(BUILD_PATH);
const CLIENT_BUILD_DIR = path.resolve("build/client");
const VITE_BIN = resolveLocalBin("vite");
const SERVER_ENTRY = path.resolve("server/index.js");

let appProcess = null;
let isShuttingDown = false;
let restartTimer = null;
let restartInFlight = false;
let buildWatcher = null;

const devPingServer = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/ping") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }

  response.writeHead(204);
  response.end();
});

await new Promise((resolve, reject) => {
  devPingServer.once("error", reject);
  devPingServer.listen(0, "127.0.0.1", resolve);
});

const devPingAddress = devPingServer.address();

if (!devPingAddress || typeof devPingAddress === "string") {
  throw new Error("Could not determine Remix dev ping server address");
}

const DEV_ENV = {
  ...process.env,
  NODE_ENV: "development",
  PORT: APP_PORT,
  REMIX_DEV_ORIGIN: `http://127.0.0.1:${devPingAddress.port}`,
};

/** Used so we wait for output from *this* vite run, not a pre-existing build. */
const watchSpawnTimeMs = Date.now();

const watchProcess = spawn(VITE_BIN, ["build", "--watch"], {
  env: DEV_ENV,
  stdio: ["inherit", "pipe", "pipe"],
});

pipeOutput("vite-watch", watchProcess);

watchProcess.on("exit", (code, signal) => {
  if (isShuttingDown) {
    return;
  }

  console.error(
    `[vite-watch] exited ${signal ? `from signal ${signal}` : `with code ${code ?? 0}`}`,
  );
  shutdown(code ?? 1);
});

await waitForInitialBuild();
printDevStableReadyBanner();
await startAppServer();

buildWatcher = watch(BUILD_DIR, (eventType, fileName) => {
  if (!fileName || typeof fileName !== "string") {
    return;
  }

  if (fileName !== "index.js") {
    return;
  }

  if (eventType !== "change" && eventType !== "rename") {
    return;
  }

  scheduleRestart();
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function resolveLocalBin(name) {
  const executable = process.platform === "win32" ? `${name}.cmd` : name;
  return path.resolve("node_modules", ".bin", executable);
}

function pipeOutput(label, childProcess) {
  pipeLinesPrefixed(label, process.stdout, childProcess.stdout, childProcess);
  pipeLinesPrefixed(label, process.stderr, childProcess.stderr, childProcess);
}

/**
 * Prefix each *line* of child output. Raw chunk prefixing breaks Vite’s progress lines
 * (labels appear mid-path) and makes logs hard to read.
 */
function pipeLinesPrefixed(label, sink, childStream, childProc) {
  if (!childStream) {
    return;
  }

  let buf = "";

  childStream.on("data", (chunk) => {
    buf += chunk.toString().replace(/\r\n/g, "\n");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      sink.write(`[${label}] ${line}\n`);
    }
  });

  const flushTail = () => {
    if (buf.length > 0) {
      sink.write(`[${label}] ${buf}\n`);
      buf = "";
    }
  };

  childStream.on("end", flushTail);
  childProc.once("close", flushTail);
}

function printDevStableReadyBanner() {
  const port = String(APP_PORT);
  const url = `http://127.0.0.1:${port}`;
  // stderr: line-buffered in many terminals, so this stays visible above Vite stdout spam
  console.error("");
  console.error("────────────────────────────────────────────────────────────");
  console.error("  dev-stable: initial Vite build finished.");
  console.error(`  Starting Express + Remix on port ${port}…`);
  console.error(`  When you see 'server listening', open ${url}`);
  console.error("  Ctrl+C stops Vite and the app (you may see ^C before the next log line).");
  console.error("────────────────────────────────────────────────────────────");
  console.error("");
}

async function waitForInitialBuild() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (hasFreshBuildOutput()) {
      return;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for initial build output at ${BUILD_PATH} and ${CLIENT_BUILD_DIR}. ` +
      `serverNewest=${getNewestMtimeMs(BUILD_DIR, 20)} clientNewest=${getNewestMtimeMs(CLIENT_BUILD_DIR, 24)} watchSpawn=${watchSpawnTimeMs}`,
  );
}

function hasFreshBuildOutput() {
  if (!existsSync(BUILD_PATH) || !existsSync(CLIENT_BUILD_DIR)) {
    return false;
  }

  const serverNewest = getNewestMtimeMs(BUILD_DIR, 20);
  const clientNewest = getNewestMtimeMs(CLIENT_BUILD_DIR, 24);

  // Vite may refresh only client or only server on a watch/cached pass; the other tree
  // can keep older mtimes while still being valid. Require both trees to have content and
  // at least one file touched after this process spawned vite.
  return (
    serverNewest > 0 &&
    clientNewest > 0 &&
    Math.max(serverNewest, clientNewest) >= watchSpawnTimeMs
  );
}

/**
 * Latest mtime among files under dir (recursive, bounded directory depth).
 * Files always contribute their mtime; maxDepth only limits how many directory levels we descend.
 * (Older versions decremented depth before statting files, so leaves under a depth-0 dir returned 0.)
 */
function getNewestMtimeMs(entryPath, maxDirDepth) {
  if (!existsSync(entryPath)) {
    return 0;
  }

  try {
    const st = statSync(entryPath);
    if (st.isFile()) {
      return st.mtimeMs;
    }
    if (!st.isDirectory()) {
      return 0;
    }
    if (maxDirDepth < 0) {
      return 0;
    }

    let max = 0;
    for (const name of readdirSync(entryPath)) {
      const m = getNewestMtimeMs(path.join(entryPath, name), maxDirDepth - 1);
      if (m > max) {
        max = m;
      }
    }
    return max;
  } catch {
    return 0;
  }
}

async function startAppServer() {
  appProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: DEV_ENV,
    stdio: ["inherit", "pipe", "pipe"],
  });

  pipeOutput("app", appProcess);

  appProcess.on("exit", (code, signal) => {
    if (isShuttingDown || restartInFlight) {
      return;
    }

    console.error(
      `[app] exited ${signal ? `from signal ${signal}` : `with code ${code ?? 0}`}`,
    );
    shutdown(code ?? 1);
  });
}

function scheduleRestart() {
  if (isShuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartAppServer().catch((error) => {
      console.error(`[app] restart failed: ${error instanceof Error ? error.message : String(error)}`);
      shutdown(1);
    });
  }, 200);
}

async function restartAppServer() {
  if (!appProcess) {
    await startAppServer();
    return;
  }

  restartInFlight = true;
  const previousProcess = appProcess;

  await terminateProcess(previousProcess, "app");

  restartInFlight = false;
  await startAppServer();
}

async function terminateProcess(childProcess, label) {
  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(killTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      if (childProcess.exitCode !== null || childProcess.killed) {
        finish();
        return;
      }

      console.error(`[${label}] did not exit after SIGTERM, sending SIGKILL`);
      childProcess.kill("SIGKILL");
    }, 5_000);

    childProcess.once("exit", finish);
    childProcess.kill("SIGTERM");
  });
}

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  buildWatcher?.close();

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const processes = [appProcess, watchProcess].filter(Boolean);

  await Promise.all(
    processes.map(
      (childProcess) =>
        terminateProcess(childProcess, childProcess === appProcess ? "app" : "vite-watch"),
    ),
  );

  await new Promise((resolve) => {
    devPingServer.close(() => resolve());
  });

  process.exit(exitCode);
}
