#!/usr/bin/env node

import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const restartDelayMs = 2000;
let stopping = false;
let child;

function startTunnel() {
  if (stopping) return;

  child = spawn("npx", ["--no-install", "lt", "--port", port], {
    stdio: "inherit",
    env: process.env,
  });

  child.once("error", (error) => {
    if (!stopping) console.error(`[tunnel] failed to start: ${error.message}`);
  });

  child.once("exit", (code, signal) => {
    child = undefined;
    if (stopping) return;

    console.error(
      `[tunnel] Localtunnel exited${signal ? ` with ${signal}` : ` with code ${code ?? 1}`}; restarting...`,
    );
    setTimeout(startTunnel, restartDelayMs);
  });
}

function stopTunnel() {
  stopping = true;
  if (child && !child.killed) child.kill("SIGTERM");
}

process.once("SIGINT", stopTunnel);
process.once("SIGTERM", stopTunnel);
startTunnel();
