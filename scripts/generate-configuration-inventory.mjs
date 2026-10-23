#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepository, writeInventory } from "./configuration-inventory/scan-env-inputs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const records = await scanRepository(root);
await writeInventory(root, records);
console.log(
  `Configuration inventory: ${records.length} records, ` +
    `${new Set(records.filter((record) => record.key).map((record) => record.key)).size} keys, ` +
    `${records.filter((record) => !record.key).length} dynamic reads`,
);
