#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepository } from "./configuration-inventory/scan-env-inputs.mjs";

const RUNTIME_KINDS = new Set(["cli-flag", "make-variable", "test-input", "dynamic-test-read"]);
const SERVICE_OWNERS = new Set(["app", "worker", "database"]);

function location(record) {
  return { sourceFile: record.sourceFile, line: record.line };
}

function boundaryId(record) {
  return `${record.sourceFile}:${record.line}:${record.expression ?? ""}`;
}

function finding(type, record, extra = {}) {
  return { type, ...location(record), ...(record.key ? { key: record.key } : {}), ...extra };
}

function catalogEntryMap(catalog) {
  return new Map((Array.isArray(catalog?.entries) ? catalog.entries : [])
    .filter((entry) => entry && typeof entry.key === "string")
    .map((entry) => [entry.key, entry]));
}

export function buildDriftReport({ catalog, records, staleInventory = false, catalogIssue = null }) {
  const findings = [];
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const boundaries = (Array.isArray(catalog?.dynamicBoundaries) ? catalog.dynamicBoundaries : []).filter(Boolean);
  const allowedClassifications = Array.isArray(catalog?.allowedClassifications) ? catalog.allowedClassifications : [];
  const entryMap = catalogEntryMap(catalog);
  const mainRecords = records.filter((record) => !RUNTIME_KINDS.has(record.sourceKind));
  const mainKeys = new Set(mainRecords.filter((record) => record.key).map((record) => record.key));
  const scannedBoundaryIds = new Set(records
    .filter((record) => record.sourceKind === "dynamic-runtime-read")
    .map(boundaryId));
  const catalogBoundaryIds = new Set(boundaries.map((boundary) => `${boundary.sourceFile}:${boundary.line}:${boundary.expression ?? ""}`));

  if (catalogIssue) {
    findings.push({ type: "invalid-catalog", detail: `Catalog is ${catalogIssue}.` });
  } else if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.entries) || !Array.isArray(catalog.dynamicBoundaries)) {
    findings.push({ type: "invalid-catalog", detail: "Catalog must contain version 1 entries and dynamicBoundaries arrays." });
  }
  if (JSON.stringify(allowedClassifications) !== JSON.stringify([
    "non-secret-config", "secret", "generated-deployment-value", "obsolete",
  ])) {
    findings.push({ type: "invalid-catalog", detail: "Catalog classifications do not match the approved set." });
  }

  const seenKeys = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || !entry.key) {
      findings.push({ type: "invalid-catalog", detail: "Catalog entry has no key." });
      continue;
    }
    if (seenKeys.has(entry.key)) findings.push({ type: "invalid-catalog", key: entry.key, detail: "Duplicate catalog key." });
    seenKeys.add(entry.key);
    if (!allowedClassifications.includes(entry.classification)) findings.push({ type: "invalid-catalog", key: entry.key, detail: "Invalid classification." });
    if (typeof entry.owner !== "string" || !entry.owner || entry.owner === "unassigned") findings.push({ type: "invalid-catalog", key: entry.key, detail: "Missing owner." });
    if (typeof entry.migrationTarget !== "string" || !entry.migrationTarget || entry.migrationTarget === "unassigned") findings.push({ type: "invalid-catalog", key: entry.key, detail: "Missing migration target." });
  }

  for (const record of mainRecords) {
    if (record.key && !entryMap.has(record.key)) findings.push(finding("unknown-key", record));
  }
  for (const [key, entry] of entryMap) {
    if (!mainKeys.has(key) && !entry.declarationOnly) findings.push({ type: "catalog-key-not-observed", key });
  }

  for (const record of records.filter((candidate) => candidate.sourceKind === "dynamic-runtime-read")) {
    if (!catalogBoundaryIds.has(boundaryId(record))) findings.push(finding("unresolved-dynamic-boundary", record, { expression: record.expression }));
  }
  for (const boundary of boundaries) {
    const id = `${boundary.sourceFile}:${boundary.line}:${boundary.expression ?? ""}`;
    if (!scannedBoundaryIds.has(id)) findings.push({ type: "unknown-dynamic-boundary", sourceFile: boundary.sourceFile, line: boundary.line, expression: boundary.expression });
    if (boundary.status !== "approved" || !boundary.owner || !boundary.migrationTarget || !Array.isArray(boundary.keys) || (!boundary.keys.length && typeof boundary.boundaryReason !== "string")) {
      findings.push({ type: "invalid-dynamic-boundary", sourceFile: boundary.sourceFile, line: boundary.line, expression: boundary.expression });
    }
  }

  const railwayServicesByKey = new Map();
  for (const record of records.filter((candidate) => candidate.sourceKind === "railway-variable" && candidate.service && candidate.key)) {
    const services = railwayServicesByKey.get(record.key) ?? new Set();
    services.add(record.service);
    railwayServicesByKey.set(record.key, services);
  }
  for (const [key, services] of railwayServicesByKey) {
    const entry = entryMap.get(key);
    if (entry && SERVICE_OWNERS.has(entry.owner) && !services.has(entry.owner)) {
      const record = records.find((candidate) => candidate.key === key && candidate.sourceKind === "railway-variable");
      findings.push(finding("railway-owner-mismatch", record, { services: [...services].sort().join(","), catalogOwner: entry.owner }));
    }
  }

  if (staleInventory) findings.push({ type: "stale-generated-inventory" });
  return {
    reportOnly: true,
    findings,
    summary: {
      scannedRecords: records.length,
      scannedKeys: mainKeys.size,
      findingCount: findings.length,
    },
  };
}

function markdown(report) {
  const lines = [
    "## Configuration drift report (report-only)",
    "",
    `Scanned ${report.summary.scannedRecords} records and ${report.summary.scannedKeys} keys. Found ${report.summary.findingCount} item(s).`,
    "",
  ];
  if (!report.findings.length) return `${lines.join("\n")}No drift found.\n`;
  lines.push("| Type | Key | Source | Line | Detail |", "|---|---|---|---:|---|");
  for (const item of report.findings) {
    const detail = item.detail ?? item.expression ?? item.service ?? item.catalogOwner ?? "";
    lines.push(`| ${item.type} | ${item.key ?? ""} | ${item.sourceFile ?? ""} | ${item.line ?? ""} | ${String(detail).replaceAll("|", "\\|")} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function loadCatalog(root) {
  try {
    const text = await readFile(path.join(root, "scripts/configuration-inventory/catalog.json"), "utf8");
    try {
      return { catalog: JSON.parse(text), catalogIssue: null };
    } catch {
      return { catalog: null, catalogIssue: "malformed" };
    }
  } catch {
    return { catalog: null, catalogIssue: "missing-or-unreadable" };
  }
}

export async function runConfigurationDriftCheck(root) {
  const { catalog, catalogIssue } = await loadCatalog(root);
  const records = await scanRepository(root);
  let staleInventory = false;
  try {
    execFileSync(process.execPath, [path.join(root, "scripts/generate-configuration-inventory.mjs"), "--check"], { cwd: root, stdio: "pipe" });
  } catch {
    staleInventory = true;
  }
  return buildDriftReport({ catalog, records, staleInventory, catalogIssue });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await runConfigurationDriftCheck(root);
  const reportFlagIndex = process.argv.indexOf("--report-file");
  const reportFile = reportFlagIndex >= 0 ? process.argv[reportFlagIndex + 1] : null;
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (reportFile && reportFile !== "undefined") await writeFile(path.resolve(root, reportFile), json);
  process.stdout.write(markdown(report));
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown(report), { flag: "a" });
  // This is intentionally report-only during ADR-0040 Phase 0.
  process.exitCode = 0;
}
