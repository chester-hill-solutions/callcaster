#!/usr/bin/env node
/* eslint-env node */

import "dotenv/config";

import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const APP_PORT = process.env.PORT ?? "3000";
const BUILD_PATH = path.resolve("build/index.js");
const BUILD_DIR = path.dirname(BUILD_PATH);
const REMIX_BIN = resolveLocalBin("remix");
const REMIX_SERVE_BIN = resolveLocalBin("remix-serve");

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
  REMIX_DEV_ORIGIN: `http://127.0.0.1:${devPingAddress.port}`,
};

const watchProcess = spawn(REMIX_BIN, ["watch"], {
  env: DEV_ENV,
  stdio: ["inherit", "pipe", "pipe"],
});

pipeOutput("remix-watch", watchProcess);

watchProcess.on("exit", (code, signal) => {
  if (isShuttingDown) {
    return;
  }

  console.error(
    `[remix-watch] exited ${signal ? `from signal ${signal}` : `with code ${code ?? 0}`}`,
  );
  shutdown(code ?? 1);
});

await waitForInitialBuild();
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
  childProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  childProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

async function waitForInitialBuild() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(BUILD_PATH)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for initial build at ${BUILD_PATH}`);
}

async function startAppServer() {
  appProcess = spawn(REMIX_SERVE_BIN, ["./build/index.js", "--port", APP_PORT], {
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

  await new Promise((resolve) => {
    previousProcess.once("exit", resolve);
    previousProcess.kill("SIGTERM");
  });

  restartInFlight = false;
  await startAppServer();
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
        new Promise((resolve) => {
          childProcess.once("exit", resolve);
          childProcess.kill("SIGTERM");
        }),
    ),
  );

  await new Promise((resolve) => {
    devPingServer.close(() => resolve());
  });

  process.exit(exitCode);
}
