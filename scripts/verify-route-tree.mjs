#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts/baselines/route-tree.txt");
const update = process.argv.includes("--update-baseline");

let out;
try {
  out = execSync("npx react-router routes 2>/dev/null", {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
} catch (e) {
  out = (e.stdout ?? "") + (e.stderr ?? "");
}

const normalized = out
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.includes('path="'))
  .map((l) => l.match(/path="([^"]+)"/)?.[1])
  .filter(Boolean)
  .sort()
  .join("\n");

if (update) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, normalized + "\n");
  console.log(`baseline updated (${normalized.split("\n").length} paths)`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error("No baseline; run with --update-baseline first");
  process.exit(1);
}

const prev = fs.readFileSync(BASELINE, "utf8").trim().split("\n").sort().join("\n");
if (prev === normalized) {
  console.log("route tree matches baseline");
  process.exit(0);
}

const prevSet = new Set(prev.split("\n"));
const nextSet = new Set(normalized.split("\n"));
const added = [...nextSet].filter((p) => !prevSet.has(p));
const removed = [...prevSet].filter((p) => !nextSet.has(p));
console.error("route tree mismatch");
console.error("added:", added.slice(0, 20).join(", "), added.length > 20 ? "..." : "");
console.error("removed:", removed.slice(0, 20).join(", "), removed.length > 20 ? "..." : "");
process.exit(1);
