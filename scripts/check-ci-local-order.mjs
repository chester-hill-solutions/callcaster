#!/usr/bin/env node
/* eslint-env node */
/**
 * Keeps the minutes at the END of `npm run ci:local`.
 *
 * Why this exists: `ci:local` runs 41 checks in a fixed order, and five of them
 * take essentially all the wall-clock time (`test:node`, `test:ui`, `build`,
 * `check:client-bundle`, `ci:codegen:verify`). Every other check finishes in
 * seconds. For most of this repository's life the suites ran at position 6 and
 * 7, so a file-size ceiling or a lint-ratchet count — discoverable in seconds —
 * was only reported after ~20 minutes of suites had already run.
 *
 * That cost real cycles: three full gates on one branch for an 800-line ceiling
 * and a ratchet count, and the workaround ("remember to pre-flight the cheap
 * guards") is a discipline nobody can be relied on to keep.
 *
 * So the ordering is a check rather than a preference. This fails if a slow
 * step moves ahead of a fast one, or if the two scripts stop agreeing about
 * which steps are which.
 *
 * Deliberately not a ratchet with a baseline: the correct order is absolute,
 * and there is nothing here to whittle down.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** The steps that take minutes. Everything else is seconds. */
const SLOW_STEPS = [
  "test:node",
  "test:ui",
  "build",
  "check:client-bundle",
  "ci:codegen:verify",
];

/** `npm run a && npm run b` → ["a", "b"], tolerating any whitespace. */
function stepsOf(script) {
  return script
    .split("&&")
    .map((step) => step.trim().replace(/^npm run\s+/, ""))
    .filter(Boolean);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const scripts = pkg.scripts ?? {};
const failures = [];

for (const name of ["ci:local", "ci:local:fast"]) {
  if (typeof scripts[name] !== "string") {
    failures.push(`package.json has no \`${name}\` script.`);
  }
}

if (failures.length === 0) {
  const full = stepsOf(scripts["ci:local"]);
  const fast = stepsOf(scripts["ci:local:fast"]);

  // 1. The slow five must be the LAST five, in order. A slow step anywhere
  //    earlier delays the report of every fast failure behind it.
  const tail = full.slice(-SLOW_STEPS.length);
  if (tail.join(" ") !== SLOW_STEPS.join(" ")) {
    failures.push(
      `\`ci:local\` must END with the slow steps in this order:\n` +
        `    ${SLOW_STEPS.join(" && ")}\n` +
        `  It currently ends with:\n` +
        `    ${tail.join(" && ")}\n` +
        `  A slow step before a fast one makes every fast failure wait for it.`,
    );
  }

  // 2. No slow step may appear anywhere else.
  const slowInFastPart = full
    .slice(0, full.length - SLOW_STEPS.length)
    .filter((step) => SLOW_STEPS.includes(step));
  if (slowInFastPart.length > 0) {
    failures.push(
      `\`ci:local\` runs slow steps before the fast block: ${slowInFastPart.join(", ")}.`,
    );
  }

  // 3. The fast variant must be exactly the fast block, so the two cannot
  //    drift into disagreeing about what "fast" means.
  const expectedFast = full.slice(0, full.length - SLOW_STEPS.length);
  if (fast.join(" ") !== expectedFast.join(" ")) {
    failures.push(
      `\`ci:local:fast\` must be \`ci:local\` without the slow steps.\n` +
        `  missing: ${expectedFast.filter((s) => !fast.includes(s)).join(", ") || "(none)"}\n` +
        `  extra:   ${fast.filter((s) => !expectedFast.includes(s)).join(", ") || "(none)"}`,
    );
  }

  // 4. Neither list may contain a step twice: a duplicated check doubles its
  //    cost and hides the omission of another.
  for (const [name, list] of [
    ["ci:local", full],
    ["ci:local:fast", fast],
  ]) {
    const seen = new Set();
    const dupes = list.filter((step) => (seen.has(step) ? true : (seen.add(step), false)));
    if (dupes.length > 0) {
      failures.push(`\`${name}\` runs a step twice: ${[...new Set(dupes)].join(", ")}.`);
    }
  }
}

if (failures.length > 0) {
  console.error("check-ci-local-order: the local gate's ordering regressed.\n");
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}

console.log(
  "check-ci-local-order: the fast checks run first and the minutes run last.",
);
