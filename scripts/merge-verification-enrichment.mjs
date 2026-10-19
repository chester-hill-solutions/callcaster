#!/usr/bin/env node
/* eslint-env node */
/**
 * Merge verification-derived enrichment records into the board lane files.
 *
 * A record for an issue that already has one is replaced, because the verdict
 * may have changed. The lane file is chosen by the record's own verdict, so a
 * moved issue leaves its old lane.
 *
 * Usage:
 *   node scripts/merge-verification-enrichment.mjs --records <file>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
const recordsFile = arg("records");
if (!recordsFile) {
  console.error("--records <file> is required.");
  process.exit(2);
}
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "issue-board-enrichment");
const incoming = JSON.parse(readFileSync(recordsFile, "utf8"));
const byNumber = new Map(incoming.map((r) => [r.issueNumber, r]));

// Load every lane file.
const lanes = new Map();
for (const file of readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  lanes.set(file, JSON.parse(readFileSync(path.join(dir, file), "utf8")));
}

// A record's lane decides its file: fix-now.json, verify-close.json, and so on.
const fileForVerdict = {
  "fix-now": "fix-now.json",
  "verify-close": "verify-close.json",
  "needs-repro": "needs-repro.json",
  "needs-decision": "needs-decision.json",
  "blocked-epic": "blocked-epic.json",
  duplicate: "duplicate.json",
};

let added = 0;
let replaced = 0;
for (const [file, records] of lanes) {
  const keep = records.filter((record) => {
    if (!byNumber.has(record.issueNumber)) return true;
    const replacement = byNumber.get(record.issueNumber);
    const target = fileForVerdict[replacement.verdict];
    if (target !== file) {
      // The verdict moved lanes: drop it here, it is added to the target below.
      replaced += 1;
      return false;
    }
    return false;
  });
  lanes.set(file, keep);
}

for (const record of incoming) {
  const file = fileForVerdict[record.verdict];
  if (!file) {
    console.error(`unknown verdict ${record.verdict} for #${record.issueNumber}`);
    process.exit(2);
  }
  const records = lanes.get(file);
  if (records.some((r) => r.issueNumber === record.issueNumber)) {
    replaced += 1;
    continue;
  }
  records.push(record);
  added += 1;
}

for (const [file, records] of lanes) {
  // Preserve the existing order. The lane files are mostly sorted with newer
  // records appended, and re-sorting them turns a one-record change into a
  // whole-file diff.
  writeFileSync(path.join(dir, file), `${JSON.stringify(records, null, 2)}\n`);
}
console.log(`added ${added} records, replaced ${replaced}`);
for (const [file, records] of lanes) console.log(`  ${file}: ${records.length}`);
