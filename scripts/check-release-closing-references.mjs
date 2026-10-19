#!/usr/bin/env node
/**
 * Fail if a release pull request names issues that GitHub will not close.
 *
 * Background: GitHub closes ONE issue per closing keyword. It does not read a
 * comma separated list behind a single keyword. The release PR #2668
 * (dev -> master, merged 2026-10-16) ended with:
 *
 *   Closes #2655, #2663, #2634, #2605, #1292, #2596, #2588, #2503, #2504,
 *   #2505, #2513, #2510, #2517, #2508, #1347, #2010, #2298
 *
 * and only #2655 closed. The issue timeline is the proof: #2655 closed at
 * the merge timestamp by the merger, while #2663 and #2504 were closed by
 * hand a day later, and #2605, #2503, #2513 and #2510 were never closed at
 * all even though their fixes are in master. Every issue that stays open
 * stays on the on-dev lane of the CHS backlog project, so the board keeps
 * re-auditing work that already shipped.
 *
 * The gate in .github/workflows/release-close-issues.yml accepted that body,
 * because its regex treated the comma list as a group of closing references.
 * The gate was checking a shape GitHub does not honour.
 *
 * The rule GitHub actually implements: every issue needs its own keyword.
 *
 *   Closes #2655, closes #2663, closes #2634
 *
 * This script finds a keyword followed by a comma separated list of issue
 * numbers and fails, naming the numbers that would be left open.
 *
 * Usage:
 *   node scripts/check-release-closing-references.mjs <body-file>
 *   node scripts/check-release-closing-references.mjs --body "<text>"
 *   node scripts/check-release-closing-references.mjs --json <body-file>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The keywords GitHub recognises for closing an issue from a PR body. */
export const CLOSING_KEYWORDS = [
  "close",
  "closes",
  "closed",
  "fix",
  "fixes",
  "fixed",
  "resolve",
  "resolves",
  "resolved",
];

const KEYWORD = CLOSING_KEYWORDS.join("|");

/** A keyword with one issue number. This is the shape GitHub honours. */
const SINGLE_REFERENCE = new RegExp(
  `\\b(?:${KEYWORD})\\b[\\s:]*#([0-9]+)`,
  "gi",
);

/** A keyword with one issue number followed by a comma list of more. */
const GROUPED_REFERENCE = new RegExp(
  `\\b(?:${KEYWORD})\\b[\\s:]*#([0-9]+)((?:[\\s]*,[\\s]*#?[0-9]+)+)`,
  "gi",
);

/**
 * Analyse a pull request body.
 *
 * Returns the issue numbers GitHub will close, and the numbers that are named
 * behind a single keyword and so will stay open.
 */
export function analyzeClosingReferences(body) {
  const text = typeof body === "string" ? body : "";

  const closes = [];
  const seen = new Set();
  for (const match of text.matchAll(SINGLE_REFERENCE)) {
    const number = Number(match[1]);
    if (!seen.has(number)) {
      seen.add(number);
      closes.push(number);
    }
  }

  const offenders = [];
  for (const match of text.matchAll(GROUPED_REFERENCE)) {
    const first = Number(match[1]);
    const rest = [...match[2].matchAll(/#?([0-9]+)/g)].map((m) => Number(m[1]));
    offenders.push({
      keyword: match[0].match(/^\s*\S+/)[0].trim(),
      first,
      stranded: rest,
      text: match[0].replace(/\s+/g, " ").trim(),
    });
  }

  const stranded = [...new Set(offenders.flatMap((offender) => offender.stranded))].sort(
    (a, b) => a - b,
  );

  return { closes, offenders, stranded };
}

/** The body a release pull request should have written instead. */
export function suggestBody(offenders) {
  return offenders
    .map((offender) => {
      const keyword = offender.keyword.toLowerCase();
      return [offender.first, ...offender.stranded]
        .map((number) => `${keyword} #${number}`)
        .join(", ");
    })
    .join("\n");
}

function readBody(argv) {
  const json = argv.includes("--json");
  const bodyIndex = argv.indexOf("--body");
  if (bodyIndex >= 0) return { body: argv[bodyIndex + 1] ?? "", json };
  // The first argument that is not a flag is the body file. `--json <file>`
  // is a flag followed by a file, so the file is found the same way.
  const file = argv.find((arg) => !arg.startsWith("--") && arg.length > 0);
  if (!file) {
    console.error("usage: check-release-closing-references.mjs <body-file> | --body <text>");
    process.exit(2);
  }
  return { body: fs.readFileSync(file, "utf8"), json };
}

function main() {
  const argv = process.argv.slice(2);
  const { body, json } = readBody(argv);
  const result = analyzeClosingReferences(body);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.closes.length > 0) {
      console.log(`GitHub will close: ${result.closes.join(", ")}`);
    }
    if (result.stranded.length > 0) {
      console.error("");
      console.error("::error::GitHub closes ONE issue per closing keyword. These numbers are named");
      console.error("::error::behind a single keyword, so they will stay open when this merges:");
      console.error(`::error::  ${result.stranded.join(", ")}`);
      console.error("");
      console.error("::error::Repeat the keyword for each issue:");
      for (const line of suggestBody(result.offenders).split("\n")) {
        console.error(`::error::  ${line}`);
      }
    }
  }

  process.exit(result.stranded.length > 0 ? 1 : 0);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main();
}
