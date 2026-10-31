#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PREPARE_STEPS,
  CHECK_STEPS,
  SLOW_STEPS,
} from "./lib/local-gate-plan.mjs";

/** Check the plan before running tools that write generated files or caches. */
export function validateGatePlan(scripts, { prepare, checks, slow }) {
  const failures = [];
  const expectedSlow = [
    "test:vitest",
    "test:node:runtime",
    "build",
    "check:client-bundle",
    "ci:codegen:verify",
  ];
  if (slow.join(" ") !== expectedSlow.join(" ")) {
    failures.push(
      "The optional full run must keep tests, runtime tests, build, bundle and codegen in sequence.",
    );
  }
  const expectedPrepare = [
    "check:ci-local-order",
    "check:vendor-dist",
    "check:bun-lock",
    "typecheck",
    "lint",
    "check:lint-ratchet",
  ];
  if (prepare.join(" ") !== expectedPrepare.join(" ")) {
    failures.push(
      "Preparation must keep vendor builds, typegen and the shared lint cache in sequence.",
    );
  }
  if (
    scripts["ci:local"] !== "node scripts/run-local-gate.mjs" ||
    scripts["ci:local:fast"] !== "node scripts/run-local-gate.mjs --fast" ||
    scripts["ci:local:full"] !== "node scripts/run-local-gate.mjs --full"
  ) {
    failures.push(
      "Fast and full local gates must use the shared runner and plan.",
    );
  }
  if (scripts["test:vitest"] !== "vitest run -c vitest.config.ts") {
    failures.push(
      "The full Vitest check must use the shared Node and UI configuration.",
    );
  }
  const seen = new Set();
  for (const step of [...prepare, ...checks, ...slow]) {
    if (seen.has(step)) failures.push(`Duplicate step: ${step}`);
    seen.add(step);
    if (typeof scripts[step] !== "string")
      failures.push(`Missing package script: ${step}`);
  }
  return failures;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );
  const failures = validateGatePlan(pkg.scripts, {
    prepare: PREPARE_STEPS,
    checks: CHECK_STEPS,
    slow: SLOW_STEPS,
  });
  if (failures.length) {
    console.error(
      `check-ci-local-order: invalid local gate plan.\n${failures.join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "check-ci-local-order: fast checks are the local default; full local validation is explicit.",
    );
  }
}
