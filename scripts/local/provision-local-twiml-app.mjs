#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  localEnvironmentName,
  normalizeEnvironmentBaseUrl,
  provisionEnvironmentTwimlApp,
} from "../../app/server/environment-twiml-app.server.ts";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");
const localEnvPath = path.join(rootDir, ".env.local");

const fileEnv = {
  ...(readEnvFile(envPath) ?? {}),
  ...(readEnvFile(localEnvPath) ?? {}),
};
const config = { ...fileEnv, ...process.env };

const devName = requireConfig("DEV_NAME");
const environment = requireConfig("ENV");
const accountSid = requireConfig("TWILIO_SID");
const authToken = requireConfig("TWILIO_AUTH_TOKEN");
const baseUrl = normalizeBaseUrl(requireConfig("BASE_URL"));
const environmentName = localEnvironmentName(devName, environment);
const application = await provisionEnvironmentTwimlApp({
  accountSid,
  authToken,
  environmentName,
  baseUrl,
});

for (const filePath of [localEnvPath, envPath]) {
  if (fs.existsSync(filePath)) {
    updateEnvValue(filePath, "TWILIO_APP_SID", application.sid);
  }
}

console.log(`${application.created ? "Created" : "Updated"} ${application.friendlyName}`);
console.log(`TWILIO_APP_SID=${application.sid}`);
console.log(`Voice URL: ${application.voiceUrl}`);

function readEnvFile(filePath) {
  return fs.existsSync(filePath) ? dotenv.parse(fs.readFileSync(filePath)) : null;
}

function requireConfig(name) {
  const value = config[name]?.trim();
  if (!value || value.includes("placeholder") || value === "developer-name") {
    throw new Error(`Set ${name} in .env.local before running make twiml.`);
  }
  return value;
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid BASE_URL: ${value}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`BASE_URL must use https for Twilio callbacks: ${url.href}`);
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return normalizeEnvironmentBaseUrl(url.toString());
}

function updateEnvValue(filePath, name, value) {
  const source = fs.readFileSync(filePath, "utf8");
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^#?\\s*${name}=.*$`, "m");
  const updated = pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
  fs.writeFileSync(filePath, updated);
}
