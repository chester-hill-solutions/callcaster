/**
 * Unit tests for the pure CI path-classification logic
 * (scripts/lib/ci-changes-lib.mjs) behind `check:ci-changes` job scoping.
 *
 * The risk these guard against is a FALSE NEGATIVE — a changed file that
 * should scope a job in but classifies false, silently skipping e2e or
 * bundle-guard on a real regression. Every glob gets both a positive and a
 * lookalike-negative case.
 */
import { describe, expect, test } from "vitest";

import { changedFiles, classify, globToRegExp } from "../scripts/lib/ci-changes-lib.mjs";

describe("globToRegExp", () => {
  test("app/** matches app files at any depth, not sibling prefixes", () => {
    const rx = globToRegExp("app/**");
    expect(rx.test("app/routes/index.tsx")).toBe(true);
    expect(rx.test("app/x.ts")).toBe(true);
    expect(rx.test("apps/x.ts")).toBe(false);
    expect(rx.test("src/app/x.ts")).toBe(false);
  });

  test("dir/** matches files directly inside, not just nested ones", () => {
    expect(globToRegExp("scripts/e2e/**").test("scripts/e2e/run.mjs")).toBe(true);
    expect(globToRegExp("scripts/e2e/**").test("scripts/e2e/deep/run.mjs")).toBe(true);
    expect(globToRegExp("scripts/e2e/**").test("scripts/e2e")).toBe(false);
  });

  test("single * stays within one path segment and escapes regex metachars", () => {
    expect(globToRegExp("vite.config.*").test("vite.config.ts")).toBe(true);
    expect(globToRegExp("vite.config.*").test("app/vite.config.ts")).toBe(false);
    expect(globToRegExp("Dockerfile*").test("Dockerfile.worker")).toBe(true);
    expect(globToRegExp("docker-compose*.yml").test("docker-compose.dev.yml")).toBe(true);
    expect(globToRegExp("package.json").test("package.json")).toBe(true);
    // The dot in "package.json" is literal, not a wildcard.
    expect(globToRegExp("package.json").test("packageXjson")).toBe(false);
  });
});

describe("classify", () => {
  test("a board/doc-only change scopes no jobs in", () => {
    expect(classify(["ISSUE_BOARD.md", "scripts/generate-open-issues-board.mjs"])).toEqual({
      app: false,
      e2e: false,
    });
  });

  test("an app source change scopes both jobs in", () => {
    expect(classify(["app/lib/foo.server.ts"])).toEqual({ app: true, e2e: true });
  });

  test("e2e-only infra scopes only e2e in", () => {
    expect(classify(["e2e/specs/x.spec.ts"])).toEqual({ app: false, e2e: true });
    expect(classify(["drizzle/0001_migration.sql"])).toEqual({ app: false, e2e: true });
    expect(classify(["docker-compose.dev.yml"])).toEqual({ app: false, e2e: true });
  });

  test("workflow edits scope their own workflow in", () => {
    expect(classify([".github/workflows/ci.yml"])).toEqual({ app: true, e2e: true });
    expect(classify([".github/workflows/e2e.yml"])).toEqual({ app: false, e2e: true });
  });

  test("lockfile and config churn scopes both jobs in", () => {
    expect(classify(["package-lock.json"])).toEqual({ app: true, e2e: true });
    expect(classify(["tsconfig.json"])).toEqual({ app: true, e2e: true });
  });
});

describe("changedFiles", () => {
  test("an unresolvable base returns null (the CLI degrades to run-everything)", () => {
    expect(changedFiles("0000000000000000000000000000000000000000")).toBeNull();
  });
});
