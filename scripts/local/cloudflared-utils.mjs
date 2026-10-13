import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

export function loadLocalEnvironment(rootDir = process.cwd()) {
  const files = [path.join(rootDir, ".env"), path.join(rootDir, ".env.local")];
  const fileEnv = Object.assign(
    {},
    ...files.map((filePath) =>
      fs.existsSync(filePath) ? dotenv.parse(fs.readFileSync(filePath)) : {},
    ),
  );

  for (const [name, value] of Object.entries(fileEnv)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

export function requireTunnelIdentity() {
  const devName = required("DEV_NAME");
  const environment = required("ENV");
  const domain = process.env.CLOUDFLARE_TUNNEL_DOMAIN?.trim() || "callcaster.ca";
  const tunnelName = `${devName}-${environment}`;
  const hostname = `${tunnelName}.${domain}`;

  return { devName, environment, domain, tunnelName, hostname };
}

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value === "developer-name" || value.includes("placeholder")) {
    throw new Error(`Set ${name} before running the Cloudflare Tunnel command.`);
  }
  return value;
}

export function findCloudflared() {
  const candidates = [process.env.CLOUDFLARED_BIN, "cloudflared", "cloudflared.exe"].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) return candidate;
  }

  throw new Error(
    "cloudflared was not found. Install cloudflared or set CLOUDFLARED_BIN to its executable.",
  );
}

export function runCloudflared(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stderr ?? ""}`.trim() : "";
    throw new Error(
      `cloudflared ${args.join(" ")} failed with exit code ${result.status ?? 1}.${detail ? ` ${detail}` : ""}`,
    );
  }

  return options.capture ? result.stdout.trim() : "";
}

export function configDirectory() {
  return process.env.CLOUDFLARED_CONFIG_DIR?.trim() || path.join(os.homedir(), ".cloudflared");
}

export function configFile(identity) {
  return (
    process.env.CLOUDFLARED_CONFIG_FILE?.trim() ||
    path.join(configDirectory(), `${identity.tunnelName}.yml`)
  );
}

export function executablePath(binary, filePath) {
  if (!binary.toLowerCase().endsWith(".exe") || process.platform === "win32") {
    return filePath;
  }

  const result = spawnSync("wslpath", ["-w", filePath], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  return filePath;
}

export function credentialFile(identity, binary) {
  const configured = process.env.CLOUDFLARED_CREDENTIALS_FILE?.trim();
  if (configured) return configured;

  const candidates = [path.join(configDirectory(), `${identity.tunnelId}.json`)];
  if (binary.toLowerCase().endsWith(".exe") && process.platform !== "win32") {
    const windowsHome = windowsUserHome();
    if (windowsHome) {
      const wslHome = windowsPathToWsl(windowsHome);
      if (wslHome) {
        candidates.push(path.join(wslHome, ".cloudflared", `${identity.tunnelId}.json`));
      }
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function windowsPathToWsl(filePath) {
  const result = spawnSync("wslpath", ["-u", filePath], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();

  const drivePath = filePath.match(/^([A-Za-z]):[\\/](.*)$/);
  return drivePath ? `/mnt/${drivePath[1].toLowerCase()}/${drivePath[2].replaceAll("\\", "/")}` : null;
}

function windowsUserHome() {
  const configured = process.env.USERPROFILE?.trim();
  if (configured) return configured;

  const result = spawnSync("cmd.exe", ["/d", "/c", "echo %USERPROFILE%"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const home = result.status === 0 ? result.stdout.trim() : "";
  return home && !home.includes("%USERPROFILE%") ? home : null;
}

export function updateEnvFile(filePath, values) {
  const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  let updated = source;

  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^#?\\s*${name}=.*$`, "m");
    const line = `${name}=${value}`;
    updated = pattern.test(updated)
      ? updated.replace(pattern, line)
      : `${updated.replace(/\s*$/, "")}\n${line}\n`;
  }

  fs.writeFileSync(filePath, updated);
}
