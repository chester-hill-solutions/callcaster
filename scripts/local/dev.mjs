#!/usr/bin/env node
/* eslint-env node */

import dotenv from "dotenv";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRequiredEnv } from "../../app/lib/required-env-keys.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// Keep the shared defaults in .env, then let developer-only values in
// .env.local override them. Shell variables already present in the process win
// because dotenv does not overwrite existing variables by default.
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") });

validateRequiredEnv(process.env);

const child = spawn("bunx", ["react-router", "dev"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
