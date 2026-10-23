import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanSourceText, summarizeInventory, normalizeRailwayServiceName, validateCatalog, writeInventory } from "../scripts/configuration-inventory/scan-env-inputs.mjs";
import { buildDriftReport } from "../scripts/check-configuration-drift.mjs";

const catalog = JSON.parse(readFileSync(resolve("scripts/configuration-inventory/catalog.json"), "utf8"));

describe("configuration input inventory", () => {
  test("finds literal runtime reads without collecting values", () => {
    const records = scanSourceText(
      'const url = process.env.DATABASE_URL;\nconst name = "NOT_SCANNED_DYNAMIC";\nconst secret = process.env[name];',
      "app/example.server.ts",
    );

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "DATABASE_URL",
        sourceKind: "runtime-read",
        sourceFile: "app/example.server.ts",
        line: 1,
        valueRedacted: true,
      }),
      expect.objectContaining({
        key: null,
        sourceKind: "dynamic-runtime-read",
        line: 3,
        expression: "process.env[name]",
      }),
    ]));
    expect(JSON.stringify(records)).not.toContain("NOT_SCANNED_DYNAMIC");
  });

  test("resolves declared dynamic key lists", () => {
    const records = scanSourceText(
      'const KEYS = ["FLAG_A", "FLAG_B"];\nif (KEYS.some((key) => process.env[key] === "1")) {}',
      "app/flags.server.ts",
    );

    expect(records.filter((record) => record.key).map((record) => record.key)).toEqual([
      "FLAG_A",
      "FLAG_B",
    ]);
    expect(records.some((record) => record.key === null)).toBe(false);
  });

  test("resolves static aliases through an injected ProcessEnv parameter", () => {
    const records = scanSourceText(`const ALIASES = { endpoint: ["S3_ENDPOINT", "ENDPOINT"] };
function read(env: NodeJS.ProcessEnv = process.env, key = "endpoint") {
  return env[key];
}`, "app/object-storage.ts");

    expect(records.map((record) => record.key)).toEqual(["S3_ENDPOINT", "ENDPOINT"]);
    expect(records.some((record) => record.sourceKind === "dynamic-runtime-read")).toBe(false);
  });

  test("inventories every object-storage environment alias with a catalog classification", () => {
    const source = readFileSync(resolve("app/lib/object-storage-config.ts"), "utf8");
    const records = scanSourceText(source, "app/lib/object-storage-config.ts");
    const aliases = [
      "S3_ENDPOINT", "ENDPOINT", "AWS_ENDPOINT_URL",
      "S3_REGION", "REGION", "AWS_DEFAULT_REGION",
      "S3_ACCESS_KEY_ID", "ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY",
      "S3_BUCKET", "BUCKET", "AWS_S3_BUCKET_NAME",
    ];

    for (const key of aliases) {
      expect(records.some((record) => record.key === key)).toBe(true);
      expect(catalog.entries.find((entry: { key: string }) => entry.key === key)).toEqual(expect.objectContaining({
        classification: expect.not.stringMatching(/^unclassified$/),
        owner: "deployment",
        migrationTarget: expect.stringMatching(/^config\.(?:services|secrets)\.deployment$/),
      }));
    }
  });

  test("collects dotenv loads, example keys, Railway variables, and GitHub secrets", () => {
    expect(scanSourceText('dotenv.config({ path: ".env.local" });', "scripts/local/dev.mjs")).toEqual([
      expect.objectContaining({ sourceKind: "dotenv-load", sourceFile: "scripts/local/dev.mjs" }),
    ]);
    expect(scanSourceText("DATABASE_URL=postgres://user:password@example/db\n# OPTIONAL_KEY=do-not-copy", ".env.example")).toEqual([
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "env-example", valueRedacted: true }),
      expect.objectContaining({ key: "OPTIONAL_KEY", sourceKind: "env-example", enabled: false }),
    ]);
    expect(scanSourceText('const vars = ["DATABASE_URL"];\npreservedVariables(vars);', ".railway/environments/dev.ts")).toEqual([
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "railway-variable" }),
    ]);
    expect(scanSourceText("DATABASE_URL: ${{ secrets.DATABASE_URL }}", ".github/workflows/ci.yml")).toEqual([
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "github-secret" }),
    ]);
  });

  test("separates test inputs and records writes and deletes", () => {
    const records = scanSourceText(
      'process.env.DATABASE_URL ??= "fixture";\ndelete process.env.DATABASE_URL;',
      "test/fixture.test.ts",
    );

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKind: "test-input", usage: "read" }),
      expect.objectContaining({ sourceKind: "test-input", usage: "write" }),
      expect.objectContaining({ sourceKind: "test-input", usage: "delete" }),
    ]));
  });

  test("classifies workflow environment declarations separately", () => {
    const records = scanSourceText(
      "jobs:\n  build:\n    env:\n      DATABASE_URL: ${{ secrets.DATABASE_URL }}\n",
      ".github/workflows/ci.yml",
    );

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "github-secret" }),
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "github-workflow-env", usage: "declaration" }),
    ]));
    expect(records.some((record) => record.sourceKind === "runtime-read")).toBe(false);
    expect(scanSourceText("value: ${{ vars.PUBLIC_URL }}", ".github/workflows/ci.yml")).toEqual([
      expect.objectContaining({ key: "PUBLIC_URL", sourceKind: "github-variable" }),
    ]);
  });

  test("collects deployment and script declarations without values", () => {
    expect(scanSourceText("ENV PORT=3000\nENV HOST 0.0.0.0", "Dockerfile")).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "PORT", sourceKind: "container-env", usage: "deployment" }),
      expect.objectContaining({ key: "HOST", sourceKind: "container-env", usage: "deployment" }),
    ]));
    expect(scanSourceText("environment:\n  POSTGRES_PASSWORD: secret", "docker-compose.dev.yml")).toEqual([
      expect.objectContaining({ key: "POSTGRES_PASSWORD", sourceKind: "compose-environment" }),
    ]);
    expect(scanSourceText("echo $(WORKSPACE_ID)", "Makefile")).toEqual([
      expect.objectContaining({ key: "WORKSPACE_ID", sourceKind: "make-variable" }),
    ]);
    expect(scanSourceText('const flag = args.includes("--workspace");', "scripts/tool.mjs")).toEqual([
      expect.objectContaining({ key: "--workspace", sourceKind: "cli-flag" }),
    ]);
    expect(scanSourceText("UPPERCASE: value\nenvironment:\n  POSTGRES_DB: db\nnext: value", "docker-compose.dev.yml")).toEqual([
      expect.objectContaining({ key: "POSTGRES_DB", sourceKind: "compose-environment" }),
    ]);
  });

  test("summarizes sources without values", () => {
    const summary = summarizeInventory(scanSourceText(
      "process.env.BASE_URL;\nprocess.env.BASE_URL = \"fixture\";",
      "app/example.ts",
    ));

    expect(summary).toEqual([
      expect.objectContaining({
        key: "BASE_URL",
        sourceCount: 2,
        usages: ["read", "write"],
        classification: "unclassified",
        owner: "unassigned",
      }),
    ]);
    expect(JSON.stringify(summary)).not.toContain("fixture");
  });

  test("keeps CLI flags out of the environment-key catalog", () => {
    const records = [
      ...scanSourceText('args.includes("--check");\nprocess.env.BASE_URL;', "scripts/tool.mjs"),
      ...scanSourceText("make $(WORKSPACE_ID)", "Makefile"),
    ];
    expect(summarizeInventory(records).map((record) => record.key)).toEqual(["BASE_URL"]);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "--check", sourceKind: "cli-flag" }),
      expect.objectContaining({ key: "WORKSPACE_ID", sourceKind: "make-variable" }),
    ]));
  });

  test("keeps test-only inputs out of the main catalog and preserves shared runtime keys", () => {
    const records = [
      ...scanSourceText("process.env.SHARED_KEY;", "app/example.ts"),
      ...scanSourceText("process.env.SHARED_KEY;\nprocess.env.TEST_ONLY;\nconst key = process.env[name];", "test/example.test.ts"),
    ];

    const main = records.filter((record) => !["test-input", "dynamic-test-read"].includes(record.sourceKind));
    expect(summarizeInventory(main).map((record) => record.key)).toContain("SHARED_KEY");
    expect(summarizeInventory(main).map((record) => record.key)).not.toContain("TEST_ONLY");
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "TEST_ONLY", sourceKind: "test-input" }),
      expect.objectContaining({ sourceKind: "dynamic-test-read" }),
    ]));
  });

  test("writes separate test and operational reports", async () => {
    const root = resolve(".");
    const outputRoot = resolve("/tmp/opencode/configuration-inventory-test-output");
    const records = [
      ...scanSourceText("process.env.RUNTIME_KEY;", "app/example.ts"),
      ...scanSourceText("process.env.RUNTIME_KEY;\nprocess.env.TEST_KEY;", "test/example.test.ts"),
      ...scanSourceText('args.includes("--check");', "scripts/tool.mjs"),
      ...scanSourceText("echo $(MAKE_KEY)", "Makefile"),
    ];
    await writeInventory(root, records, outputRoot);
    const runtimeReport = JSON.parse(readFileSync(resolve(outputRoot, "docs/generated/configuration-inventory.json"), "utf8"));
    const testReport = JSON.parse(readFileSync(resolve(outputRoot, "docs/generated/test-configuration-inputs.json"), "utf8"));
    const operationalReport = JSON.parse(readFileSync(resolve(outputRoot, "docs/generated/operational-inputs.json"), "utf8"));
    const testMarkdown = readFileSync(resolve(outputRoot, "docs/generated/test-configuration-inputs.md"), "utf8");
    expect(runtimeReport.entries.map((entry: { key: string }) => entry.key)).toContain("RUNTIME_KEY");
    expect(runtimeReport.entries.map((entry: { key: string }) => entry.key)).not.toContain("TEST_KEY");
    expect(testReport.entries).toEqual(expect.arrayContaining([expect.objectContaining({ key: "TEST_KEY" })]));
    expect(testReport.entries).toEqual(expect.arrayContaining([expect.objectContaining({ key: "RUNTIME_KEY" })]));
    expect(testReport.generatedBy).toBe("tools:config:test-source-input-observations");
    expect(testReport.report).toBe("test-source-input-observations");
    expect(testReport.description).toContain("may also be listed in the runtime catalog");
    expect(testMarkdown).toContain("# Test-source configuration input observations");
    expect(testMarkdown).toContain("observations from test source files");
    expect(testMarkdown).toContain("may also be listed in the runtime catalog");
    expect(operationalReport.entries.map((entry: { key: string }) => entry.key)).toEqual(expect.arrayContaining(["--check", "MAKE_KEY"]));
    expect(testReport.provenance).toEqual(operationalReport.provenance);
  });

  test("assigns Railway variables to the exact service", () => {
    const records = scanSourceText(`const appVariables = ["APP_KEY"];
const workerVariables = ["WORKER_KEY"];
service("app", { env: { ...preservedVariables(appVariables), INLINE_APP: "x" } });
service("worker", { env: preservedVariables(workerVariables) });`, ".railway/environments/dev.ts");
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "APP_KEY", service: "app" }),
      expect.objectContaining({ key: "INLINE_APP", service: "app" }),
      expect.objectContaining({ key: "WORKER_KEY", service: "worker" }),
    ]));
  });

  test("normalizes Railway display names while preserving service ownership", () => {
    expect(normalizeRailwayServiceName("CallCaster")).toBe("app");
    expect(normalizeRailwayServiceName("callcaster-worker")).toBe("worker");
    expect(normalizeRailwayServiceName("PostgreSQL 18")).toBe("database");

    const records = scanSourceText(`const appVariables = ["APP_KEY"];
const workerVariables = ["WORKER_KEY"];
const databaseVariables = ["DATABASE_KEY"];
service("CallCaster", { env: preservedVariables(appVariables) });
service("callcaster-worker", { env: preservedVariables(workerVariables) });
service("PostgreSQL 18", { env: preservedVariables(databaseVariables) });`, ".railway/environments/dev.ts");

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "APP_KEY", service: "app" }),
      expect.objectContaining({ key: "WORKER_KEY", service: "worker" }),
      expect.objectContaining({ key: "DATABASE_KEY", service: "database" }),
    ]));
    expect(records.filter((record) => record.service).map((record) => record.service)).toEqual(expect.arrayContaining(["app", "worker", "database"]));
    expect(records.some((record) => ["CallCaster", "callcaster-worker", "PostgreSQL 18"].includes(record.service))).toBe(false);
  });

  test("includes deterministic scan provenance in every JSON report", () => {
    const reports = [
      "configuration-inventory.json",
      "configuration-key-summary.json",
      "configuration-dynamic-read-review.json",
      "test-configuration-inputs.json",
      "operational-inputs.json",
    ];
    const provenance = reports.map((report) => JSON.parse(readFileSync(resolve("docs/generated", report), "utf8")).provenance);

    for (const value of provenance) {
      expect(value.scannedRoots).toEqual(expect.arrayContaining(["app", ".railway", "package.json"]));
      expect(value.scannedFiles).toEqual(expect.arrayContaining(["scripts/configuration-inventory/scan-env-inputs.mjs"]));
      expect(value.scannedFiles).toEqual([...value.scannedFiles].sort());
      expect(value).not.toHaveProperty("generatedAt");
      expect(value).not.toHaveProperty("timestamp");
    }
    expect(provenance[0]).toEqual(provenance[1]);
    expect(provenance[0]).toEqual(provenance[2]);
    expect(provenance[0]).toEqual(provenance[3]);
  });

  test("requires exactly one valid catalog entry for every runtime key", () => {
    const records = [
      ...scanSourceText("process.env.RUNTIME_KEY;", "app/example.ts"),
      ...scanSourceText("const key = process.env[name];", "scripts/example.mjs"),
    ];
    const valid = {
      version: 1,
      allowedClassifications: ["non-secret-config", "secret", "generated-deployment-value", "obsolete"],
      entries: [{ key: "RUNTIME_KEY", classification: "non-secret-config", owner: "app", migrationTarget: "config.services.app" }],
      dynamicBoundaries: [{ sourceFile: "scripts/example.mjs", line: 1, expression: "process.env[name]", status: "approved", owner: "scripts", migrationTarget: "config.scripts.dynamicEnvironmentAccess", keys: [], boundaryReason: "External key-name boundary." }],
    };
    expect(validateCatalog(valid, records)).toBe(true);
    expect(() => validateCatalog({ ...valid, entries: [...valid.entries, { ...valid.entries[0] }] }, records)).toThrow(/duplicate key/);
    expect(() => validateCatalog({ ...valid, entries: [] }, records)).toThrow(/missing key/);
    expect(() => validateCatalog({ ...valid, entries: [{ ...valid.entries[0], classification: "unknown" }] }, records)).toThrow(/Invalid classification/);
    expect(() => validateCatalog({ ...valid, entries: [{ ...valid.entries[0], key: "UNKNOWN_KEY" }] }, records)).toThrow(/missing key|unknown key/);
  });

  test("checked-in catalog covers generated runtime summary and approves every dynamic read", () => {
    const inventory = JSON.parse(readFileSync(resolve("docs/generated/configuration-inventory.json"), "utf8"));
    const summary = JSON.parse(readFileSync(resolve("docs/generated/configuration-key-summary.json"), "utf8"));
    expect(catalog.entries).toHaveLength(summary.keys.length);
    expect(new Set(catalog.entries.map((entry: { key: string }) => entry.key)).size).toBe(catalog.entries.length);
    expect(summary.keys.every((entry: { classification: string; owner: string; migrationTarget: string }) =>
      entry.classification !== "unclassified" && entry.owner !== "unassigned" && entry.migrationTarget !== "unassigned")).toBe(true);
    expect(inventory.entries.filter((entry: { sourceKind: string }) => entry.sourceKind === "dynamic-runtime-read")
      .every((entry: { dynamicBoundary: string }) => entry.dynamicBoundary === "approved")).toBe(true);
    expect(JSON.stringify(inventory)).not.toContain("process.env[secret");
  });

  test("does not infer shell inputs from arbitrary uppercase variables", () => {
    const records = scanSourceText("VALUE=local\necho $VALUE\necho ${DATABASE_URL:-unset}\nexport API_KEY", "scripts/example.sh");
    expect(records.map((record) => record.key)).toEqual(expect.arrayContaining(["DATABASE_URL", "API_KEY"]));
    expect(records).toHaveLength(2);
  });

  test("does not scan documentation examples as runtime inputs", () => {
    expect(scanSourceText("process.env.SECRET; args.includes('--flag');", "docs/example.md")).toEqual([]);
  });

  test("reports drift categories without exposing values", () => {
    const records = [
      { key: "NEW_SECRET", sourceKind: "runtime-read", sourceFile: "app/new.ts", line: 4, service: "worker", value: "do-not-print" },
      { key: "DATABASE_URL", sourceKind: "railway-variable", sourceFile: ".railway/environments/dev.ts", line: 8, service: "worker" },
      { key: null, sourceKind: "dynamic-runtime-read", sourceFile: "app/new.ts", line: 9, expression: "process.env[name]" },
    ];
    const report = buildDriftReport({
      catalog: {
        version: 1,
        allowedClassifications: ["non-secret-config", "secret", "generated-deployment-value", "obsolete"],
        entries: [{ key: "DATABASE_URL", classification: "secret", owner: "app", migrationTarget: "config.secrets.app" }],
        dynamicBoundaries: [],
      },
      records,
      staleInventory: true,
    });

    expect(report.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining([
      "unknown-key", "railway-owner-mismatch", "unresolved-dynamic-boundary", "stale-generated-inventory",
    ]));
    expect(JSON.stringify(report)).not.toContain("do-not-print");
  });

  test("drift reports are explicitly non-blocking", () => {
    const report = buildDriftReport({ catalog: null, records: [], staleInventory: true });
    expect(report.reportOnly).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
    const output = execFileSync("node", ["scripts/check-configuration-drift.mjs"], { encoding: "utf8" });
    expect(output).toContain("Configuration drift report (report-only)");
  }, 15000);

  test("invalid catalog command reports safely without exposing values", () => {
    const catalogPath = resolve("scripts/configuration-inventory/catalog.json");
    const original = readFileSync(catalogPath, "utf8");
    writeFileSync(catalogPath, '{"secretValue":"do-not-print-this-value"');
    try {
      const result = spawnSync("node", ["scripts/check-configuration-drift.mjs"], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("invalid-catalog");
      expect(`${result.stdout}${result.stderr}`).not.toContain("do-not-print-this-value");
    } finally {
      writeFileSync(catalogPath, original);
    }
  }, 15000);

  test("--check detects stale reports without writing them", () => {
    const report = resolve("docs/generated/operational-inputs.md");
    const original = readFileSync(report, "utf8");
    writeFileSync(report, `${original}\nstale\n`);
    try {
      expect(() => execFileSync("node", ["scripts/generate-configuration-inventory.mjs", "--check"], { encoding: "utf8" })).toThrow();
      expect(readFileSync(report, "utf8")).toBe(`${original}\nstale\n`);
    } finally {
      writeFileSync(report, original);
    }
  });

  test("--check detects missing reports without recreating them", () => {
    const report = resolve("docs/generated/operational-inputs.md");
    const renamed = `${report}.missing-for-check`;
    renameSync(report, renamed);
    try {
      expect(() => execFileSync("node", ["scripts/generate-configuration-inventory.mjs", "--check"], { encoding: "utf8" })).toThrow();
      expect(() => readFileSync(report, "utf8")).toThrow();
    } finally {
      renameSync(renamed, report);
    }
  });
});
