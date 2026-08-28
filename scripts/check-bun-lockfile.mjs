#!/usr/bin/env node
/* eslint-env node */
/**
 * Dual-lockfile drift gate: this repo installs with npm (package-lock.json,
 * CI quality job, local dev) AND with bun (bun.lock, the Railway Docker
 * build). Adding or changing a dependency with one package manager leaves the
 * other lockfile stale, and the failure surfaces far from the cause —
 * `bun install --frozen-lockfile` inside the Railway image build, minutes
 * after the push (see the #1379 deploy failure).
 *
 * This check runs `bun install --frozen-lockfile --dry-run` and fails when
 * bun.lock would change — i.e. when the two lockfiles disagree. If it fails:
 * run `bun install` and commit the updated bun.lock alongside package-lock.json.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function main() {
  const result = spawnSync("bun", ["install", "--frozen-lockfile", "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status === 0) {
    console.log("bun-lock check passed: bun.lock matches package.json.");
    return;
  }

  console.error(
    [
      "bun-lock check FAILED: bun.lock is out of sync with package.json.",
      "",
      "This repo installs with npm (package-lock.json) and builds with bun",
      "(bun.lock — Railway Docker). Both lockfiles must move together.",
      "",
      "Fix: run `bun install`, commit bun.lock with your package.json change.",
      "",
      result.stderr?.trim() || result.stdout?.trim(),
    ].join("\n"),
  );
  process.exit(result.status ?? 1);
}

main();
