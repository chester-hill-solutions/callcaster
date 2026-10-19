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
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
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
  "NOT_FIXED": "fix-now",
};

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
  const record = {
    issueNumber: issue,
    verdict: lane,
    summary: verdict.mechanism || verdict.note || "Claimed fix does not resolve the symptom.",
    currentBehavior: verdict.verdict === "VERIFIED"
      ? "The fix is in master. The symptom can only be confirmed by a person, so the issue stays open until they confirm it."
      : "The claimed fix does not resolve the reported symptom.",
    resolution:
      verdict.verdict === "VERIFIED"
        ? "Run the verification on master, then close. No new code unless it fails."
        : verdict.note || "Find the mechanism that resolves the symptom, then implement it.",
    lookIn,
    existingTests: verdict.test ? [verdict.test] : [],
    acceptanceCriteria: verdict.verdict === "VERIFIED"
      ? ["A person confirms the reported symptom is gone on master."]
      : [],
  };
  if (verdict.note && verdict.verdict !== "VERIFIED") record.rootCause = verdict.note;
  records.push(record);
}

records.sort((a, b) => a.issueNumber - b.issueNumber);
writeFileSync(outFile, `${JSON.stringify(records, null, 2)}\n`);
console.log(`wrote ${records.length} records to ${outFile}`);
for (const r of records) console.log(`  #${r.issueNumber} ${r.verdict}`);
