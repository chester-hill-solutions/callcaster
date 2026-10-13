#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  configFile,
  executablePath,
  findCloudflared,
  loadLocalEnvironment,
  required,
  requireTunnelIdentity,
} from "./cloudflared-utils.mjs";

loadLocalEnvironment();
const binary = findCloudflared();
const identity = requireTunnelIdentity();
const config = executablePath(binary, configFile(identity));
required("BASE_URL");

const expectedUrl = `https://${identity.hostname}`;
if (new URL(process.env.BASE_URL).origin !== expectedUrl) {
  throw new Error(`BASE_URL must be ${expectedUrl} for this developer and environment.`);
}

const child = spawn(binary, ["tunnel", "--config", config, "run", identity.tunnelName], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

function stop(signal) {
  child.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("error", (error) => {
  console.error(`[tunnel] ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
