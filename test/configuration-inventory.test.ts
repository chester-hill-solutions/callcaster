import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanSourceText, summarizeInventory, normalizeRailwayServiceName } from "../scripts/configuration-inventory/scan-env-inputs.mjs";

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
    const records = scanSourceText('args.includes("--check");\nprocess.env.BASE_URL;', "scripts/tool.mjs");
    expect(summarizeInventory(records).map((record) => record.key)).toEqual(["BASE_URL"]);
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ key: "--check", sourceKind: "cli-flag" })]));
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

  test("does not infer shell inputs from arbitrary uppercase variables", () => {
    const records = scanSourceText("VALUE=local\necho $VALUE\necho ${DATABASE_URL:-unset}\nexport API_KEY", "scripts/example.sh");
    expect(records.map((record) => record.key)).toEqual(expect.arrayContaining(["DATABASE_URL", "API_KEY"]));
    expect(records).toHaveLength(2);
  });

  test("does not scan documentation examples as runtime inputs", () => {
    expect(scanSourceText("process.env.SECRET; args.includes('--flag');", "docs/example.md")).toEqual([]);
  });

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
