import { describe, expect, test } from "vitest";
import { scanSourceText, summarizeInventory } from "../scripts/configuration-inventory/scan-env-inputs.mjs";

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
    expect(scanSourceText("DATABASE_URL=postgres://user:password@example/db", ".env.example")).toEqual([
      expect.objectContaining({ key: "DATABASE_URL", sourceKind: "env-example", valueRedacted: true }),
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
});
