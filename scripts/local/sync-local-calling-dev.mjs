#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import postgres from "postgres";

loadLocalEnvironment();
requireLocalEnvironment();

const sql = postgres(process.env.DATABASE_URL);
let workspaces;

try {
  const rows = await sql`
    SELECT id, name, twilio_data
    FROM workspace
    ORDER BY name, id
  `;
  workspaces = rows.filter((workspace) => hasTwilioCredentials(workspace.twilio_data));
} finally {
  await sql.end();
}

console.log(
  `Found ${workspaces.length} local workspace${workspaces.length === 1 ? "" : "s"} with Twilio credentials for ${process.env.DEV_NAME}-${process.env.ENV}.`,
);
for (const workspace of workspaces) {
  console.log(`  - ${workspace.name ?? workspace.id} (${workspace.id})`);
}

const args = ["scripts/local/sync-calling-dev.mjs"];
for (const workspace of workspaces) {
  args.push("--workspace-id", workspace.id);
}
if (process.env.BASE_URL) {
  args.push("--base-url", process.env.BASE_URL);
}

const exitCode = await runSync(args);
process.exitCode = exitCode;

function requireLocalEnvironment() {
  if (process.env.RAILWAY_ENVIRONMENT_NAME) {
    throw new Error("Refusing local calling sync inside a Railway environment.");
  }
  if (process.env.ENV !== "local") {
    throw new Error("Set ENV=local before running make calling:sync-local.");
  }
  if (!process.env.DEV_NAME || process.env.DEV_NAME === "developer-name") {
    throw new Error("Set DEV_NAME in .env.local before running make calling:sync-local.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL before running make calling:sync-local.");
  }
}

function loadLocalEnvironment() {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");
  const localEnvPath = path.join(rootDir, ".env.local");
  const fileEnv = {
    ...(readEnvFile(envPath) ?? {}),
    ...(readEnvFile(localEnvPath) ?? {}),
  };

  for (const [name, value] of Object.entries({ ...fileEnv, ...process.env })) {
    if (value !== undefined) {
      process.env[name] = value;
    }
  }
}

function readEnvFile(filePath) {
  return fs.existsSync(filePath) ? dotenv.parse(fs.readFileSync(filePath)) : null;
}

function hasTwilioCredentials(twilioData) {
  return Boolean(
    twilioData &&
      typeof twilioData === "object" &&
      isTwilioAccountSid(twilioData.sid) &&
      typeof twilioData.authToken === "string" &&
      twilioData.authToken,
  );
}

function isTwilioAccountSid(value) {
  return typeof value === "string" && /^AC[0-9a-f]{32}$/i.test(value);
}

function runSync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`Local calling sync stopped by ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}
