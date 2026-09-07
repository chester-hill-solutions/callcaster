import { afterEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateIssueBoard } from "../scripts/issue-board-generate.mjs";

// E4.1: a failed generation never mutates the curated enrichment files.
const TMP = join(import.meta.dirname, ".board-atomic-tmp");
const DIR = join(TMP, "enrichment");
const OUTPUT = join(TMP, "ISSUE_BOARD.md");

function writeLane(file: string, body: unknown) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, file), typeof body === "string" ? body : JSON.stringify(body));
}

function record(overrides: Record<string, unknown> = {}) {
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

function issue(number: number) {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/x/y/issues/${number}`,
    updatedAt: "2026-08-26T00:00:00Z",
    assignees: { nodes: [] },
    labels: { nodes: [{ name: "bug" }] },
    projectItems: { nodes: [] },
  };
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(DIR).sort()) out[file] = readFileSync(join(DIR, file), "utf8");
  return out;
}

function run(issues: ReturnType<typeof issue>[]) {
  return generateIssueBoard({
    enrichmentDir: DIR,
    output: OUTPUT,
    issues,
    repo: "x/y",
    projectNumber: 1,
    reviewedAt: "dev@test",
  });
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("generateIssueBoard is atomic", () => {
  test("malformed JSON is reported by file name and nothing is written", () => {
    writeLane("a.json", [record({ issueNumber: 1 })]);
    writeLane("b.json", "{ not json");
    const before = snapshot();
    expect(() => run([issue(1)])).toThrow(/b\.json is not valid JSON/);
    expect(snapshot()).toEqual(before);
    expect(existsSync(OUTPUT)).toBe(false);
    expect(readdirSync(DIR).some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  test("a malformed record is reported and not deleted, even when it belongs to a closed issue", () => {
    writeLane("a.json", [record({ issueNumber: 1 }), { issueNumber: 2, verdict: "nope" }]);
    const before = snapshot();
    expect(() => run([issue(1)])).toThrow(/a\.json #2/);
    expect(snapshot()).toEqual(before);
    expect(existsSync(OUTPUT)).toBe(false);
  });

  test("a blockedBy edge left dangling by pruning fails without partial writes", () => {
    writeLane("a.json", [record({ issueNumber: 1, blockedBy: [2] })]);
    writeLane("b.json", [record({ issueNumber: 2, verdict: "verify-close" })]);
    const before = snapshot();
    // #2 closed: pruning would remove it, leaving #1 pointing at nothing.
    expect(() => run([issue(1)])).toThrow(/#1 blockedBy unknown issue 2/);
    expect(snapshot()).toEqual(before);
    expect(existsSync(OUTPUT)).toBe(false);
    expect(readdirSync(DIR).some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  test("a successful run prunes closed records across files, leaves untouched files byte-identical, and writes the board", () => {
    writeLane("a.json", [record({ issueNumber: 1 }), record({ issueNumber: 3, verdict: "verify-close" })]);
    writeLane("b.json", [record({ issueNumber: 2, verdict: "needs-decision" }), record({ issueNumber: 4, verdict: "needs-repro" })]);
    writeLane("c.json", [record({ issueNumber: 5, verdict: "blocked-epic" })]);
    const cBefore = readFileSync(join(DIR, "c.json"), "utf8");

    const result = run([issue(1), issue(2), issue(5)]);

    expect(result.pruned).toEqual([3, 4]);
    expect(JSON.parse(readFileSync(join(DIR, "a.json"), "utf8")).map((r: { issueNumber: number }) => r.issueNumber)).toEqual([1]);
    expect(JSON.parse(readFileSync(join(DIR, "b.json"), "utf8")).map((r: { issueNumber: number }) => r.issueNumber)).toEqual([2]);
    expect(readFileSync(join(DIR, "c.json"), "utf8")).toBe(cBefore);
    expect(readFileSync(OUTPUT, "utf8")).toContain("#1");
    expect(readdirSync(DIR).some((f) => f.endsWith(".tmp"))).toBe(false);
  });
});
