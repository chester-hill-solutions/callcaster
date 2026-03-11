import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const coverageDir = path.join(repoRoot, "coverage");

const inputs = [
  {
    name: "vitest-node",
    path: path.join(coverageDir, "vitest-node", "lcov.info"),
  },
  {
    name: "vitest-ui",
    path: path.join(coverageDir, "vitest-ui", "lcov.info"),
  },
  {
    name: "deno",
    path: path.join(coverageDir, "deno", "lcov.info"),
  },
];

for (const i of inputs) {
  if (!fs.existsSync(i.path)) {
    console.error(`Missing coverage input ${i.name}: ${i.path}`);
    process.exit(1);
  }
}

function normalizeSf(sf) {
  if (sf.startsWith("file://")) {
    try {
      return fileURLToPath(sf);
    } catch {
      return sf;
    }
  }
  if (sf.startsWith("/")) return sf;
  // Vitest LCOV can emit repo-relative SF paths like `app/...`.
  return path.resolve(repoRoot, sf);
}

/**
 * @typedef {{
 *  lines: Map<number, number>,
 *  branches: Map<string, number>,
 *  fnLine: Map<string, number>,
 *  fnHits: Map<string, number>,
 * }} FileCov
 */

/** @returns {Map<string, FileCov>} */
function parseLcov(text) {
  /** @type {Map<string, FileCov>} */
  const out = new Map();
  /** @type {string | null} */
  let currentFile = null;

  const ensure = (file) => {
    let fc = out.get(file);
    if (!fc) {
      fc = {
        lines: new Map(),
        branches: new Map(),
        fnLine: new Map(),
        fnHits: new Map(),
      };
      out.set(file, fc);
    }
    return fc;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("SF:")) {
      currentFile = normalizeSf(line.slice(3).trim());
      ensure(currentFile);
      continue;
    }
    if (!currentFile) continue;
    if (line === "end_of_record") {
      currentFile = null;
      continue;
    }

    const fc = ensure(currentFile);

    if (line.startsWith("DA:")) {
      const [lnStr, hitsStr] = line.slice(3).split(",");
      const ln = Number(lnStr);
      const hits = Number(hitsStr);
      if (Number.isFinite(ln) && Number.isFinite(hits)) {
        fc.lines.set(ln, (fc.lines.get(ln) ?? 0) + hits);
      }
      continue;
    }

    if (line.startsWith("BRDA:")) {
      const parts = line.slice(5).split(",");
      if (parts.length >= 4) {
        const [ln, block, branch, taken] = parts;
        const key = `${ln},${block},${branch}`;
        const hits = taken === "-" ? 0 : Number(taken);
        if (Number.isFinite(hits)) {
          fc.branches.set(key, (fc.branches.get(key) ?? 0) + hits);
        }
      }
      continue;
    }

    if (line.startsWith("FN:")) {
      const rest = line.slice(3);
      const idx = rest.indexOf(",");
      if (idx > 0) {
        const ln = Number(rest.slice(0, idx));
        const name = rest.slice(idx + 1);
        if (name) {
          const existing = fc.fnLine.get(name);
          if (existing == null || (Number.isFinite(ln) && ln < existing)) {
            if (Number.isFinite(ln)) fc.fnLine.set(name, ln);
          }
        }
      }
      continue;
    }

    if (line.startsWith("FNDA:")) {
      const rest = line.slice(5);
      const idx = rest.indexOf(",");
      if (idx > 0) {
        const hits = Number(rest.slice(0, idx));
        const name = rest.slice(idx + 1);
        if (name && Number.isFinite(hits)) {
          fc.fnHits.set(name, (fc.fnHits.get(name) ?? 0) + hits);
        }
      }
      continue;
    }
  }

  return out;
}

/** @returns {Map<string, FileCov>} */
function mergeCovMaps(maps) {
  /** @type {Map<string, FileCov>} */
  const merged = new Map();

  const ensure = (file) => {
    let fc = merged.get(file);
    if (!fc) {
      fc = {
        lines: new Map(),
        branches: new Map(),
        fnLine: new Map(),
        fnHits: new Map(),
      };
      merged.set(file, fc);
    }
    return fc;
  };

  for (const m of maps) {
    for (const [file, fc] of m.entries()) {
      const out = ensure(file);
      for (const [ln, hits] of fc.lines.entries()) {
        out.lines.set(ln, (out.lines.get(ln) ?? 0) + hits);
      }
      for (const [k, hits] of fc.branches.entries()) {
        out.branches.set(k, (out.branches.get(k) ?? 0) + hits);
      }
      for (const [name, ln] of fc.fnLine.entries()) {
        const existing = out.fnLine.get(name);
        if (existing == null || ln < existing) out.fnLine.set(name, ln);
      }
      for (const [name, hits] of fc.fnHits.entries()) {
        out.fnHits.set(name, (out.fnHits.get(name) ?? 0) + hits);
      }
    }
  }

  return merged;
}

function serializeLcov(map) {
  const files = [...map.keys()].sort((a, b) => a.localeCompare(b));
  const lines = [];
  for (const file of files) {
    const fc = map.get(file);
    if (!fc) continue;
    lines.push(`SF:${file}`);

    // Functions
    const fnNames = [...fc.fnLine.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of fnNames) {
      lines.push(`FN:${fc.fnLine.get(name)},${name}`);
    }
    for (const name of fnNames) {
      lines.push(`FNDA:${fc.fnHits.get(name) ?? 0},${name}`);
    }

    // Lines
    const lineNos = [...fc.lines.keys()].sort((a, b) => a - b);
    for (const ln of lineNos) {
      lines.push(`DA:${ln},${fc.lines.get(ln) ?? 0}`);
    }

    // Branches (key is ln,block,branch)
    const brKeys = [...fc.branches.keys()].sort((a, b) => a.localeCompare(b));
    for (const key of brKeys) {
      const [ln, block, br] = key.split(",");
      lines.push(`BRDA:${ln},${block},${br},${fc.branches.get(key) ?? 0}`);
    }

    lines.push("end_of_record");
  }
  return lines.join("\n") + "\n";
}

const parsed = inputs.map((i) => parseLcov(fs.readFileSync(i.path, "utf8")));
const mergedMap = mergeCovMaps(parsed);

const outFile = path.join(coverageDir, "lcov.merged.info");
fs.writeFileSync(outFile, serializeLcov(mergedMap));

function listSourceFiles() {
  /** @type {string[]} */
  const roots = [
    path.join(repoRoot, "app"),
    path.join(repoRoot, "supabase", "functions"),
  ];

  /** @type {string[]} */
  const out = [];
  const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);

  /** @param {string} p */
  const shouldSkipDir = (p) => {
    const rel = path.relative(repoRoot, p);
    if (rel.startsWith("node_modules")) return true;
    if (rel.startsWith("build")) return true;
    if (rel.startsWith(path.join("public", "build"))) return true;
    if (rel.startsWith(path.join("supabase", "functions", "__tests__"))) return true;
    return false;
  };

  /** @param {string} p */
  const shouldSkipFile = (p) => {
    const rel = path.relative(repoRoot, p);
    if (rel.includes(".test.")) return true;
    if (rel.endsWith(".d.ts")) return true;
    if (rel.endsWith(".types.ts")) return true;
    if (rel.endsWith("database.types.ts")) return true;
    if (rel.endsWith("supabase.types.ts")) return true;
    if (rel.endsWith("twilio.types.ts")) return true;
    // Deprecated/non-runtime.
    if (rel.startsWith("twilio-serverless")) return true;
    // Treat these as legacy/non-runtime for now (also excluded from Vitest coverage configs).
    if (rel.startsWith(path.join("app", "routes", "archive"))) return true;
    if (rel.startsWith(path.join("app", "routes", "old."))) return true;
    return false;
  };

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    if (shouldSkipDir(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(full);
        if (!exts.has(ext)) continue;
        if (shouldSkipFile(full)) continue;
        out.push(full);
      }
    }
  };

  for (const r of roots) walk(r);
  return out.sort((a, b) => a.localeCompare(b));
}

const expectedFiles = listSourceFiles();
const missing = expectedFiles.filter((f) => !mergedMap.has(f));

function isTrivialSourceFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split("\n").map((l) => l.trim());
    const meaningful = lines.filter((l) => {
      if (!l) return false;
      if (l.startsWith("//")) return false;
      if (l.startsWith("/*") || l.startsWith("*") || l.endsWith("*/")) return false;
      return true;
    });
    if (meaningful.length === 0) return true;

    let inExportBlock = false;
    for (const l of meaningful) {
      if (inExportBlock) {
        if (l.includes("} from") || l.includes("}from") || l.includes("};") || l === "}") {
          inExportBlock = false;
        }
        continue;
      }

      if (l.startsWith("export {") || l.startsWith("export type {")) {
        // Multi-line export block.
        if (!(l.includes("} from") || l.includes("}from") || l.includes("};"))) {
          inExportBlock = true;
        }
        continue;
      }

      const ok =
        l.startsWith("export ") ||
        l.startsWith("import ") ||
        l.startsWith("import type ") ||
        l.startsWith("export type ") ||
        l.startsWith("export interface ") ||
        l.startsWith("type ") ||
        l.startsWith("interface ") ||
        l.startsWith("declare ");
      if (!ok) return false;
    }
    return !inExportBlock;
  } catch {
    return false;
  }
}

const missingNonTrivial = missing.filter((f) => !isTrivialSourceFile(f));
if (missingNonTrivial.length) {
  console.error("\nCoverage gate failed: missing files in merged LCOV (treated as 0% covered).");
  for (const f of missingNonTrivial.slice(0, 30)) {
    console.error(`- missing: ${path.relative(repoRoot, f)}`);
  }
  console.error(`\nTotal missing non-trivial files: ${missingNonTrivial.length}`);
  process.exit(1);
}

/** @returns {{ok: boolean, failures: Array<{file: string, kind: string, have: number, total: number}>}} */
function checkAll100(covMap) {
  const failures = [];
  for (const [file, fc] of covMap.entries()) {
    const rel = path.relative(repoRoot, file);
    if (rel.startsWith("twilio-serverless")) continue;
    const totalLines = fc.lines.size;
    const hitLines = [...fc.lines.values()].filter((h) => h > 0).length;
    if (totalLines > 0 && hitLines !== totalLines) {
      failures.push({ file, kind: "lines", have: hitLines, total: totalLines });
    }

    const totalBranches = fc.branches.size;
    const hitBranches = [...fc.branches.values()].filter((h) => h > 0).length;
    if (totalBranches > 0 && hitBranches !== totalBranches) {
      failures.push({
        file,
        kind: "branches",
        have: hitBranches,
        total: totalBranches,
      });
    }

    const totalFns = fc.fnLine.size;
    const hitFns = [...fc.fnLine.keys()].filter((n) => (fc.fnHits.get(n) ?? 0) > 0).length;
    if (totalFns > 0 && hitFns !== totalFns) {
      failures.push({ file, kind: "functions", have: hitFns, total: totalFns });
    }
  }
  return { ok: failures.length === 0, failures };
}

const check = checkAll100(mergedMap);
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
  process.exit(1);
}

console.log(`Coverage gate passed (100%): ${path.relative(repoRoot, outFile)}`);

