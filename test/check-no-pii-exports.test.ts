import { describe, expect, it } from "vitest";
import { rootExportFiles } from "../scripts/lib/check-no-pii-exports-lib.mjs";

describe("check-no-pii-exports", () => {
  it("flags a CSV in the repository root", () => {
    expect(rootExportFiles(["campaign-33-all-messages.csv"])).toEqual([
      "campaign-33-all-messages.csv",
    ]);
  });

  it("flags a PDF in the repository root", () => {
    expect(rootExportFiles(["lf-student-send-report.pdf"])).toEqual([
      "lf-student-send-report.pdf",
    ]);
  });

  it("matches the extension case-insensitively", () => {
    expect(rootExportFiles(["Report.CSV"])).toEqual(["Report.CSV"]);
  });

  it("ignores nested fixture files", () => {
    expect(
      rootExportFiles([
        "e2e/fixtures/files/audience-good.csv",
        "e2e/fixtures/files/audience-bad-headers.csv",
        "docs/overview.pdf",
      ]),
    ).toEqual([]);
  });

  it("ignores tracked files that are not exports", () => {
    expect(
      rootExportFiles([
        "package.json",
        "app/lib/campaign-export-db.server.ts",
        "scripts/check-no-pii-exports.mjs",
      ]),
    ).toEqual([]);
  });

  it("does not flag a root directory that merely contains a dot", () => {
    expect(rootExportFiles(["some.file.ts", "a.b/c.ts"])).toEqual([]);
  });
});
