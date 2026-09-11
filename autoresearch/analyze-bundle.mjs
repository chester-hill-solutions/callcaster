#!/usr/bin/env node
// Bundle analysis: list client JS files by size, identify optimization targets.
// Usage: node autoresearch/analyze-bundle.mjs [--json]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const json = process.argv.includes("--json");
const dir = "build/client/assets";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => {
    const s = statSync(join(dir, f));
    const content = readFileSync(join(dir, f), "utf8");
    // Count unique npm packages referenced (rough heuristic: import paths)
    const npmImports = new Set(
      [...content.matchAll(/from"([^"]+)"/g)]
        .map((m) => m[1])
        .filter((p) => !p.startsWith(".") && !p.startsWith("@/")),
    );
    return {
      file: f,
      raw: s.size,
      npmModules: [...npmImports].sort(),
    };
  })
  .sort((a, b) => b.raw - a.raw);

const total = files.reduce((a, f) => a + f.raw, 0);

if (json) {
  console.log(JSON.stringify({ total, files }, null, 2));
} else {
  console.log(`Total client JS: ${(total / 1024 / 1024).toFixed(2)}MB (${files.length} files)\n`);
  console.log("Top 15 files:");
  files.slice(0, 15).forEach((f) => {
    console.log(`  ${(f.raw / 1024).toFixed(0)}KB  ${f.file}`);
    if (f.npmModules.length > 0) {
      console.log(`         deps: ${f.npmModules.join(", ")}`);
    }
  });
  console.log("\nEmpty route stubs (0 bytes):", files.filter((f) => f.raw === 0).length);
}
