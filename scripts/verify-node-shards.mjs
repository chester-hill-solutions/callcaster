import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Require the full Vitest file inventory exactly once across two passing shards. */
export function verifyNodeShards(expected, reports) {
  if (!Array.isArray(expected) || expected.length === 0) {
    throw new Error("The unsharded test inventory is empty or invalid");
  }
  if (reports.length !== 2)
    throw new Error("Both Node shard reports are required");
  const wanted = new Set(expected.map((entry) => resolve(entry.file)));
  const seen = new Set();
  let tests = 0;
  for (const report of reports) {
    if (
      report.success !== true ||
      !Number.isInteger(report.numTotalTests) ||
      report.numTotalTests < 1 ||
      !(report.numPassedTests > 0) ||
      !Array.isArray(report.testResults)
    ) {
      throw new Error(
        "Each Node shard must complete successfully with executed tests",
      );
    }
    tests += report.numTotalTests;
    for (const file of report.testResults) {
      const name = resolve(file.name);
      if (!wanted.has(name))
        throw new Error(`Unexpected test file: ${file.name}`);
      if (seen.has(name))
        throw new Error(`Test file ran in multiple shards: ${file.name}`);
      seen.add(name);
    }
  }
  const missing = [...wanted].filter((file) => !seen.has(file));
  if (missing.length)
    throw new Error(
      `Node shards omitted ${missing.length} file(s): ${missing.join(", ")}`,
    );
  return { files: seen.size, tests };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [inventory, ...reports] = process.argv.slice(2);
  if (!inventory)
    throw new Error(
      "Usage: verify-node-shards.mjs INVENTORY REPORT_1 REPORT_2",
    );
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  const result = verifyNodeShards(read(inventory), reports.map(read));
  console.log(
    `Node shards passed: ${result.files} files, ${result.tests} tests; full file inventory covered exactly once.`,
  );
}
