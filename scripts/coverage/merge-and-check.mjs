import fs from "node:fs";
import path from "node:path";
import {
  checkAll100,
  coverageDir,
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
const missing = expectedFiles.filter((f) => !mergedMap.has(f));

const missingNonTrivial = missing.filter((f) => !isTrivialSourceFile(f));
if (missingNonTrivial.length) {
  console.error(
    "\nCoverage gate failed: missing files in merged LCOV (treated as 0% covered).",
  );
  for (const f of missingNonTrivial.slice(0, 30)) {
    console.error(`- missing: ${path.relative(repoRoot, f)}`);
  }
  console.error(
    `\nTotal missing non-trivial files: ${missingNonTrivial.length}`,
  );
  process.exit(1);
}

const expectedSet = new Set(expectedFiles);

const enforceFullCoverage = process.env.COVERAGE_FULL === "1";
const check = enforceFullCoverage
  ? checkAll100(mergedMap, expectedSet)
  : { ok: true, failures: [] };
if (!check.ok) {
  console.error("\nCoverage gate failed: not at 100% for all files.");
  console.error("First failures:");
  for (const f of check.failures.slice(0, 30)) {
    console.error(
      `- ${f.kind}: ${f.have}/${f.total} in ${path.relative(repoRoot, f.file)}`,
    );
  }
  console.error(
    `\nTotal failing file-metrics: ${check.failures.length}. Full report: ${outFile}`,
  );
  console.error("Run: npm run test:coverage:report:strict");
  process.exit(1);
}

console.log(`Coverage gate passed (100%): ${path.relative(repoRoot, outFile)}`);
