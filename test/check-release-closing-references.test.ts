import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  analyzeClosingReferences,
  suggestBody,
} from "../scripts/check-release-closing-references.mjs";

const SCRIPT = "scripts/check-release-closing-references.mjs";

/** The body of release PR #2668, which closed one issue out of seventeen. */
const RELEASE_2668 = [
  "## Promoted issues",
  "",
  "Closes #2655, #2663, #2634, #2605, #1292, #2596, #2588, #2503, #2504, #2505, #2513, #2510, #2517, #2508, #1347, #2010, #2298",
].join("\n");

describe("analyzeClosingReferences", () => {
  it("finds the issues GitHub will close when each has its own keyword", () => {
    const result = analyzeClosingReferences("Closes #1, closes #2, closes #3");
    expect(result.closes).toEqual([1, 2, 3]);
    expect(result.stranded).toEqual([]);
  });

  it("finds the issues left open by the last release body", () => {
    const result = analyzeClosingReferences(RELEASE_2668);
    expect(result.closes).toEqual([2655]);
    expect(result.stranded).toEqual([
      1292, 1347, 2010, 2298, 2503, 2504, 2505, 2508, 2510, 2513, 2517, 2588, 2596, 2605,
      2634, 2663,
    ]);
  });

  it("leaves a bare mention alone, because it was never a closing reference", () => {
    const result = analyzeClosingReferences("Promotes the work in (#4242) and (#4243).");
    expect(result.closes).toEqual([]);
    expect(result.stranded).toEqual([]);
  });

  it("does not mistake prose that mentions a fix for a closing reference", () => {
    const result = analyzeClosingReferences("Fix the thing described in #1234 before the release.");
    expect(result.stranded).toEqual([]);
  });

  it("does not mistake a sentence after a keyword for a list", () => {
    // "fixed" is itself a GitHub closing keyword, so #5678 closes too.
    const result = analyzeClosingReferences("Closes #1234, and then we also fixed #5678");
    expect(result.closes).toEqual([1234, 5678]);
    expect(result.stranded).toEqual([]);
  });

  it("catches a list where the later numbers have no hash", () => {
    const result = analyzeClosingReferences("Closes #100, 200, 300");
    expect(result.stranded).toEqual([200, 300]);
  });

  it("reports the keyword and the numbers it stranded", () => {
    const result = analyzeClosingReferences("Fixes #7, #8");
    expect(result.offenders).toHaveLength(1);
    expect(result.offenders[0].keyword).toBe("Fixes");
    expect(result.offenders[0].first).toBe(7);
    expect(result.offenders[0].stranded).toEqual([8]);
  });

  it("finds nothing in a body with no issue at all", () => {
    const result = analyzeClosingReferences("## What\n\nPromote the current dev changes.");
    expect(result.closes).toEqual([]);
    expect(result.stranded).toEqual([]);
  });
});

describe("suggestBody", () => {
  it("writes the body GitHub will honour", () => {
    const result = analyzeClosingReferences(RELEASE_2668);
    const suggestion = suggestBody(result.offenders);
    expect(suggestion).toContain("closes #2655");
    expect(suggestion).toContain("closes #2298");
    expect(suggestion).not.toMatch(/closes #2655, #2663/);
  });
});

describe("the command line", () => {
  it("fails on a body that names issues behind one keyword", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-body-"));
    const file = join(dir, "body.md");
    writeFileSync(file, RELEASE_2668);
    let failed = false;
    try {
      execFileSync("node", [SCRIPT, file], { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      failed = true;
      expect((error as { status: number }).status).toBe(1);
    }
    expect(failed).toBe(true);
  });

  it("passes a body that gives every issue its own keyword", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-body-"));
    const file = join(dir, "body.md");
    writeFileSync(file, "Closes #1, closes #2, closes #3");
    const output = execFileSync("node", [SCRIPT, file], { encoding: "utf8" });
    expect(output).toContain("GitHub will close: 1, 2, 3");
  });

  it("reads the body file when --json comes first", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-body-"));
    const file = join(dir, "body.md");
    writeFileSync(file, "Closes #42");
    const output = execFileSync("node", [SCRIPT, "--json", file], { encoding: "utf8" });
    expect(JSON.parse(output).closes).toEqual([42]);
  });
});
