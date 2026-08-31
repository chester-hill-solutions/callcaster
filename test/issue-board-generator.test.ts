import { describe, expect, test } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBoard, loadEnrichment } from "../scripts/issue-board-lib.mjs";

const TMP = join(import.meta.dirname, ".board-tmp");

function writeLane(file, records) {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, file), JSON.stringify(records));
}

function record(overrides = {}) {
  return {
    issueNumber: 1,
    verdict: "fix-now",
    summary: "s",
    lookIn: [],
    existingTests: [],
    missingTests: [],
    acceptanceCriteria: [],
    blockedBy: [],
    ...overrides,
  };
}

function issue(number, updatedAt = "2026-08-26T00:00:00Z") {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/x/y/issues/${number}`,
    updatedAt,
    assignees: { nodes: [] },
    labels: { nodes: [{ name: "bug" }] },
    projectItems: { nodes: [] },
  };
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("loadEnrichment", () => {
  test("accepts valid lane files", () => {
    writeLane("a.json", [record({ issueNumber: 1 }), record({ issueNumber: 2, verdict: "verify-close" })]);
    const records = loadEnrichment(TMP);
    expect(records.map((r) => r.issueNumber)).toEqual([1, 2]);
  });

  test("rejects duplicate issue numbers across lane files", () => {
    writeLane("a.json", [record({ issueNumber: 7 })]);
    writeLane("b.json", [record({ issueNumber: 7 })]);
    expect(() => loadEnrichment(TMP)).toThrow(/duplicate issueNumber 7/);
  });

  test("rejects an invalid verdict", () => {
    writeLane("a.json", [record({ verdict: "nope" })]);
    expect(() => loadEnrichment(TMP)).toThrow(/Invalid enum value|Invalid option/i);
  });

  test("rejects an unknown blockedBy target", () => {
    writeLane("a.json", [record({ issueNumber: 1, blockedBy: [999] })]);
    expect(() => loadEnrichment(TMP)).toThrow(/blockedBy unknown issue 999/);
  });

  test("rejects a blockedBy cycle", () => {
    writeLane("a.json", [
      record({ issueNumber: 1, blockedBy: [2] }),
      record({ issueNumber: 2, blockedBy: [1] }),
    ]);
    expect(() => loadEnrichment(TMP)).toThrow(/blockedBy cycle/);
  });
});

describe("buildBoard", () => {
  const records = [
    record({ issueNumber: 1, size: "S", risk: "high", recommendedTitle: "A better title" }),
    record({ issueNumber: 2, verdict: "duplicate", duplicateOf: 1 }),
    record({ issueNumber: 3, verdict: "blocked-epic", blockedBy: [1] }),
  ];

  test("renders every open issue into its lane and links blockers", () => {
    const { md, counts } = buildBoard({
      issues: [issue(3), issue(1), issue(2)],
      records,
      repo: "x/y",
      projectNumber: 9,
      reviewedAt: "dev@abc1234",
    });
    expect(counts).toEqual({ "fix-now": 1, "verify-close": 0, "needs-repro": 0, "needs-decision": 0, "blocked-epic": 1, duplicate: 1 });
    expect(md).toContain("Reviewed at `dev@abc1234`");
    expect(md).toContain("## Fix now — 1");
    expect(md).toContain("Recommended title: **A better title**");
    expect(md).toContain("Duplicate of: [#1](https://github.com/x/y/issues/1)");
    expect(md).toContain("Blocked by: [#1](https://github.com/x/y/issues/1)");
  });

  test("is deterministic — no timestamp in the output", () => {
    const issues = [issue(3), issue(1), issue(2)];
    const a = buildBoard({ issues, records, repo: "x/y", projectNumber: 9, reviewedAt: "dev@abc1234" });
    const b = buildBoard({ issues, records, repo: "x/y", projectNumber: 9, reviewedAt: "dev@abc1234" });
    expect(a.md).toBe(b.md);
    expect(a.md).not.toContain("Generated:");
  });

  test("throws when an open issue has no enrichment record", () => {
    expect(() =>
      buildBoard({ issues: [issue(1), issue(99)], records, repo: "x/y", projectNumber: 9, reviewedAt: "dev@abc1234" }),
    ).toThrow(/open issues without enrichment: 99/);
  });

  test("throws when a record references a closed issue", () => {
    expect(() =>
      buildBoard({ issues: [issue(2)], records, repo: "x/y", projectNumber: 9, reviewedAt: "dev@abc1234" }),
    ).toThrow(/enrichment records for closed issues: 1, 3/);
  });
});