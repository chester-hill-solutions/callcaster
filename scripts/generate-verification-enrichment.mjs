#!/usr/bin/env node
/* eslint-env node */
/**
 * Seed board enrichment records for the issues a verification sweep reopened.
 *
 * The records carry the verdict, the mechanism that was found (or the reason
 * none was found) and the evidence, so the regenerated board says WHY an issue
 * is still open instead of only naming a lane.
 *
 * Usage:
 *   node scripts/generate-verification-enrichment.mjs --verdicts <dir> --out <file>
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (name) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
};
const verdictsDir = arg("verdicts");
const outFile = arg("out");
if (!verdictsDir || !outFile) {
  console.error("--verdicts <dir> and --out <file> are required.");
  process.exit(2);
}

const briefs = new Map();
for (const file of readdirSync(verdictsDir)) {
  if (!file.endsWith(".json")) continue;
  const v = JSON.parse(readFileSync(path.join(verdictsDir, file), "utf8"));
  briefs.set(v.issue, v);
}

const LANE = {
  "VERIFIED+manual": "verify-close",
  PARTIAL: "fix-now",
  "PARTIAL+manual": "fix-now",
  "NOT_FIXED": "fix-now",
  "NOT_FIXED+manual": "fix-now",
};

// Some issues belong in a lane other than the one their verdict implies.
// #1717 was never implemented because the policy decision was never written
// down, so it is a decision, not a fix.
const LANE_OVERRIDE = {
  1717: "needs-decision",
};

/** The verifier's note reads as a diagnosis followed by the action. Split it. */
function splitNote(note) {
  if (!note) return { rootCause: "", resolution: "" };
  const sentences = note.match(/[^.!?]+[.!?]+/g) ?? [note];
  if (sentences.length < 2) return { rootCause: note, resolution: "" };
  const last = sentences[sentences.length - 1].trim();
  const rest = sentences.slice(0, -1).join(" ").trim();
  const ACTION = /^(fix|implement|add|create|remove|replace|subscribe|do not|drop|give|use|split|revert|the (fix|remaining|change|creation|gap|rest|work|item)|what is missing|so |only |hence|therefore|this (needs|requires)|no |keep |either )/i;
  if (ACTION.test(last)) return { rootCause: rest, resolution: last };
  return { rootCause: note, resolution: "" };
}

const records = [];
for (const [issue, verdict] of briefs) {
  const key = `${verdict.verdict}${verdict.manual ? "+manual" : ""}`;
  const lane = LANE[key];
  if (!lane) continue;
  const evidence = verdict.evidence ?? [];
  const lookIn = [
    ...new Set(
      evidence
        .map((e) => String(e).match(/([\w./-]+\.(?:ts|tsx|md|sql|mjs)):(\d+)/)?.[1])
        .filter(Boolean),
    ),
  ];
  const { rootCause, resolution } = splitNote(verdict.note);
  const record = {
    issueNumber: issue,
    verdict: LANE_OVERRIDE[issue] ?? lane,
    summary: verdict.mechanism || "Claimed fix does not resolve the symptom.",
    currentBehavior:
      verdict.verdict === "VERIFIED"
        ? "The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it."
        : "The claimed fix does not resolve the reported symptom.",
    resolution:
      resolution ||
      (verdict.verdict === "VERIFIED"
        ? "Run the verification on master, then close. No new code unless it fails."
        : "Implement the missing mechanism named in the root cause."),
    lookIn,
    existingTests: verdict.test ? [verdict.test] : [],
    acceptanceCriteria:
      verdict.verdict === "VERIFIED"
        ? ["A person confirms the reported symptom is gone on master."]
        : [],
  };
  if (rootCause) record.rootCause = rootCause;
  records.push(record);
}

records.sort((a, b) => a.issueNumber - b.issueNumber);
writeFileSync(outFile, `${JSON.stringify(records, null, 2)}\n`);
console.log(`wrote ${records.length} records to ${outFile}`);
for (const r of records) console.log(`  #${r.issueNumber} ${r.verdict}`);
