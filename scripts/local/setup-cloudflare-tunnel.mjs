#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  configDirectory,
  configFile,
  credentialFile,
  executablePath,
  findCloudflared,
  loadLocalEnvironment,
  requireTunnelIdentity,
  runCloudflared,
  updateEnvFile,
} from "./cloudflared-utils.mjs";

loadLocalEnvironment();
const rootDir = process.cwd();
const localEnvPath = path.join(rootDir, ".env.local");
if (!fs.existsSync(localEnvPath)) {
  throw new Error("Create .env.local from .env.example before running make tunnel-setup.");
}

const binary = findCloudflared();
const identity = requireTunnelIdentity();
const configDir = configDirectory();
const configPath = configFile(identity);

if (!tunnelExists(binary, identity.tunnelName)) {
  runCloudflared(binary, ["tunnel", "create", identity.tunnelName]);
}

runCloudflared(binary, ["tunnel", "route", "dns", identity.tunnelName, identity.hostname]);

const tunnelId = findTunnelId(binary, identity.tunnelName);
const credentialsPath = credentialFile({ ...identity, tunnelId }, binary);

if (!fs.existsSync(credentialsPath)) {
  throw new Error(
    `Tunnel credentials were not found at ${credentialsPath}. Set CLOUDFLARED_CREDENTIALS_FILE to the JSON file created by cloudflared tunnel create.`,
  );
}

fs.mkdirSync(configDir, { recursive: true });
const configCredentialsPath = executablePath(binary, credentialsPath);
const config = [
  `tunnel: ${tunnelId}`,
  `credentials-file: ${configCredentialsPath}`,
  "ingress:",
  `  - hostname: ${identity.hostname}`,
  "    service: http://127.0.0.1:3000",
  "  - service: http_status:404",
  "",
].join("\n");
fs.writeFileSync(configPath, config, { mode: 0o600 });

runCloudflared(binary, ["tunnel", "ingress", "validate", "--config", executablePath(binary, configPath)]);
runCloudflared(binary, ["tunnel", "info", identity.tunnelName]);

updateEnvFile(localEnvPath, {
  BASE_URL: `https://${identity.hostname}`,
  CLOUDFLARED_CONFIG_FILE: configPath,
});

console.log(`Cloudflare Tunnel ready: ${identity.tunnelName}`);
console.log(`Public hostname: https://${identity.hostname}`);
console.log(`Config: ${configPath}`);

function tunnelExists(binaryName, name) {
  const result = runQuiet(binaryName, ["tunnel", "info", name]);
  return result.status === 0;
}

function findTunnelId(binaryName, name) {
  const output = runCloudflared(binaryName, ["tunnel", "list", "--output", "json"], { capture: true });
  const tunnels = JSON.parse(output);
  const tunnel = tunnels.find((entry) => entry.name === name);
  if (!tunnel?.id) throw new Error(`Could not find tunnel ID for ${name}.`);
  return tunnel.id;
}

function runQuiet(binaryName, args) {
  return spawnSync(binaryName, args, { stdio: "ignore" });
}
