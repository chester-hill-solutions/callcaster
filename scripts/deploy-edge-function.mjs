#!/usr/bin/env node
/**
 * Deploy a Supabase Edge Function without deno.lock v5 (Supabase bundler incompatibility).
 * Usage: node scripts/deploy-edge-function.mjs <function-name> [--project-ref <ref>]
 */
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const LOCK_PATH = join(ROOT, "supabase/functions/deno.lock");
const BACKUP_PATH = `${LOCK_PATH}.deploy-bak`;

const functionName = process.argv[2];
if (!functionName) {
  console.error("Usage: node scripts/deploy-edge-function.mjs <function-name> [--project-ref <ref>]");
  process.exit(1);
}

const projectRefIndex = process.argv.indexOf("--project-ref");
const projectRef =
  projectRefIndex >= 0 ? process.argv[projectRefIndex + 1] : process.env.SUPABASE_PROJECT_REF;

if (!projectRef) {
  console.error("Missing project ref. Pass --project-ref or set SUPABASE_PROJECT_REF.");
  process.exit(1);
}

let movedLock = false;
try {
  if (existsSync(LOCK_PATH)) {
    renameSync(LOCK_PATH, BACKUP_PATH);
    movedLock = true;
  }

  execSync(
    `supabase functions deploy ${functionName} --project-ref ${projectRef}`,
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
} finally {
  if (movedLock && existsSync(BACKUP_PATH)) {
    renameSync(BACKUP_PATH, LOCK_PATH);
  }
}
