#!/usr/bin/env node
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scanRepository, writeInventory } from "./configuration-inventory/scan-env-inputs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const records = await scanRepository(root);
const check = process.argv.includes("--check");
const generatedFiles = [
  "configuration-inventory.json",
  "configuration-inventory.md",
  "configuration-key-summary.json",
  "configuration-key-summary.md",
  "configuration-dynamic-read-review.json",
  "configuration-dynamic-read-review.md",
  "operational-inputs.json",
  "operational-inputs.md",
];

const outputRoot = check ? await mkdtemp(path.join(tmpdir(), "callcaster-config-inventory-")) : root;
if (check) {
  try {
    await writeInventory(root, records, outputRoot);
    const differences = [];
    for (const file of generatedFiles) {
      let expected;
      try {
        expected = await readFile(path.join(root, "docs/generated", file), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          differences.push(`${file} (missing)`);
          continue;
        }
        throw error;
      }
      const actual = await readFile(path.join(outputRoot, "docs/generated", file), "utf8");
      if (expected !== actual) differences.push(file);
    }
    if (differences.length) {
      console.error(`Configuration inventory is stale: ${differences.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("Configuration inventory is current.");
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
} else {
  await writeInventory(root, records);
}
console.log(
  `Configuration inventory: ${records.length} records, ` +
    `${new Set(records.filter((record) => record.key).map((record) => record.key)).size} keys, ` +
    `${records.filter((record) => record.sourceKind === "dynamic-runtime-read" || record.sourceKind === "dynamic-test-read").length} dynamic reads`,
);
