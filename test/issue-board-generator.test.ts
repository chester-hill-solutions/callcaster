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

function withIssueFields(value, priority, effort = "Medium") {
  return {
    ...value,
    issueType: { name: "Bug" },
    issueFieldValues: { nodes: [
      { field: { name: "Priority" }, name: priority },
      { field: { name: "Effort" }, name: effort },
    ] },
  };
}

function boardOrder(md) {
  return [...md.matchAll(/^### \[#(\d+)\]/gm)].map((match) => Number(match[1]));
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
    expect(counts).toEqual({ "fix-now": 1, "verify-close": 0, "needs-repro": 0, "needs-decision": 0, "blocked-epic": 1, duplicate: 1, "needs-triage": 0 });
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

  test("renders issues without an enrichment record in the Needs triage lane", () => {
    const { md, counts } = buildBoard({
      issues: [issue(1), issue(99)],
      records: [record({ issueNumber: 1 })],
      repo: "x/y",
      projectNumber: 9,
      reviewedAt: "dev@abc1234",
    });
    expect(counts["needs-triage"]).toBe(1);
    expect(md).toContain("## Needs triage — 1");
    expect(md).toContain("### [#99](https://github.com/x/y/issues/99) Issue 99");
    expect(md).toContain("Status: No status");
    expect(md).toContain("No enrichment record yet");
    expect(md).not.toContain("open issues without enrichment");
  });

  test("throws when a record references a closed issue", () => {
    expect(() =>
      buildBoard({ issues: [issue(2)], records, repo: "x/y", projectNumber: 9, reviewedAt: "dev@abc1234" }),
    ).toThrow(/enrichment records for closed issues: 1, 3/);
  });

  test("puts urgent and high work before risk, size and recent updates", () => {
    const { md } = buildBoard({
      issues: [
        withIssueFields(issue(1, "2026-10-28T00:00:00Z"), "Low"),
        withIssueFields(issue(2), "Urgent"),
        withIssueFields(issue(3), "High"),
        withIssueFields(issue(4), "Medium"),
        issue(5, "2026-10-29T00:00:00Z"),
      ],
      records: [
        record({ issueNumber: 1, risk: "high", size: "XL" }),
        record({ issueNumber: 2, risk: "low", size: "XS" }),
        record({ issueNumber: 3, risk: "low", size: "XS" }),
        record({ issueNumber: 4, risk: "high", size: "L" }),
        record({ issueNumber: 5, risk: "high", size: "XL" }),
      ],
      repo: "x/y", projectNumber: 9, reviewedAt: "dev@test",
    });
    expect(boardOrder(md)).toEqual([2, 3, 4, 1, 5]);
    expect(md).toContain("Type: Bug · Priority: Urgent · Effort: Medium");
    expect(md).toContain("Type: unknown · Priority: unknown · Effort: unknown");
  });

  test("uses native Issue fields even when labels and Project Priority disagree", () => {
    const low = withIssueFields(issue(1), "Low", "High");
    low.labels = { nodes: [{ name: "Urgent" }] };
    low.projectItems = { nodes: [{ project: { number: 9 }, fieldValueByName: { name: "In progress" }, priority: "Urgent" }] };
    const high = withIssueFields(issue(2), "High", "Low");
    const { md } = buildBoard({
      issues: [low, high], records: [record({ issueNumber: 1 }), record({ issueNumber: 2 })],
      repo: "x/y", projectNumber: 9, reviewedAt: "dev@test",
    });
    expect(boardOrder(md)).toEqual([2, 1]);
    expect(md).toContain("Type: Bug · Priority: Low · Effort: High");
    expect(md).toContain("**IN PROGRESS**");
  });

  test("keeps verdict lanes and their existing risk order within equal priority", () => {
    const { md } = buildBoard({
      issues: [withIssueFields(issue(1), "High"), withIssueFields(issue(2), "High"), withIssueFields(issue(3), "Urgent")],
      records: [record({ issueNumber: 1, risk: "low" }), record({ issueNumber: 2, risk: "high" }), record({ issueNumber: 3, verdict: "verify-close" })],
      repo: "x/y", projectNumber: 9, reviewedAt: "dev@test",
    });
    expect(boardOrder(md)).toEqual([2, 1, 3]);
    expect(md.indexOf("## Verify and close")).toBeLessThan(md.indexOf("### [#3]"));
  });

  test("shows priority for unaudited issues and keeps unknown priorities last", () => {
    const { md } = buildBoard({
      issues: [issue(1, "2026-10-29T00:00:00Z"), withIssueFields(issue(2), "Urgent", "Low")],
      records: [], repo: "x/y", projectNumber: 9, reviewedAt: "dev@test",
    });
    expect(boardOrder(md)).toEqual([2, 1]);
    expect(md).toContain("Status: No status · Type: Bug · Priority: Urgent · Effort: Low");
  });

  test("distinguishes unread metadata from fields that GitHub returned empty", () => {
    const { md } = buildBoard({
      issues: [issue(1), { ...issue(2), issueType: null, issueFieldValues: { nodes: [] } }],
      records: [], repo: "x/y", projectNumber: 9, reviewedAt: "dev@test",
    });
    expect(md).toContain("Type: unknown · Priority: unknown · Effort: unknown · Environment: unknown");
    expect(md).toContain("Type: unset · Priority: unset · Effort: unset · Environment: unset");
  });
});
