import fs from "node:fs";
import path from "node:path";
import {
  checkAll100,
  coverageDir,
  formatStrictFailures,
  isTrivialSourceFile,
  listSourceFiles,
  loadMergedCoverageMap,
  repoRoot,
  serializeLcov,
} from "./coverage-lib.mjs";

const mergedMap = loadMergedCoverageMap();
const outFile = path.join(coverageDir, "lcov.merged.info");
fs.writeFileSync(outFile, serializeLcov(mergedMap));

const expectedFiles = listSourceFiles();
const expectedSet = new Set(expectedFiles);

const missing = expectedFiles.filter(
  (f) => !mergedMap.has(f) && !isTrivialSourceFile(f),
);

const check = checkAll100(mergedMap, expectedSet);
const failures = [
  ...missing.map((file) => ({
    file,
    kind: "missing",
    have: 0,
    total: 1,
  })),
  ...check.failures.filter((f) => f.kind !== "missing"),
];

const lines = formatStrictFailures(failures);
const summaryByArea = new Map();
for (const line of lines) {
  const rel = line.split("\t")[0];
  const area = rel.split(path.sep).slice(0, 2).join("/");
  summaryByArea.set(area, (summaryByArea.get(area) ?? 0) + 1);
}

console.log(`Strict coverage report (${failures.length} failing file-metrics)`);
console.log(`Merged LCOV: ${path.relative(repoRoot, outFile)}`);
console.log("");
console.log("By area:");
for (const [area, count] of [...summaryByArea.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  console.log(`  ${count}\t${area}`);
}
console.log("");
console.log("Failures (path\\tmetrics):");
for (const line of lines) {
  console.log(line);
}

if (failures.length > 0) {
  process.exit(1);
}

console.log("\nAll gate files at 100% lines, branches, and functions.");
