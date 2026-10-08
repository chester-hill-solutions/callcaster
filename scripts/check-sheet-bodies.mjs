import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkSheetBodyContract } from "./lib/sheet-body-contract.mjs";

function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return scan(file);
    if (file === path.join("app", "components", "ui", "sheet.tsx")) return [];
    if (!/\.[jt]sx$/.test(file) || /\.(test|spec)\.[jt]sx$/.test(file))
      return [];
    return checkSheetBodyContract(readFileSync(file, "utf8"), file);
  });
}

const failures = scan("app");
for (const { file, line, message } of failures)
  console.error(`${file}:${line}: ${message}`);
if (failures.length) process.exitCode = 1;
else console.log("Sheet body contract passed.");
