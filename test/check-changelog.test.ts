import { describe, expect, test } from "vitest";

import {
  behaviorChanged,
  evaluateChangelog,
  unreleasedEntries,
} from "../scripts/lib/check-changelog-lib.mjs";

const dated = `# Changelog

## [Unreleased]

### Fixed

## 2026-09-02 — release #1499

### Fixed

- Something shipped.
`;

const pending = `# Changelog

## [Unreleased]

### Fixed

- Not yet dated.
- Also not dated.

## 2026-09-02 — release #1499

- Something shipped.
`;

describe("behaviorChanged", () => {
  test.each([
    ["app/routes/x.tsx", true],
    ["worker/index.ts", true],
    ["client/migrations/20260901.sql", true],
    ["shared/pricing.ts", true],
    ["docs/CHANGELOG.md", false],
    ["scripts/check-changelog.mjs", false],
    ["test/foo.test.ts", false],
    ["e2e/specs/chats.spec.ts", false],
    ["apps/other.ts", false],
  ])("%s → %s", (file, expected) => {
    expect(behaviorChanged([file])).toBe(expected);
  });
});

describe("unreleasedEntries", () => {
  test("collects bullets up to the next release heading", () => {
    expect(unreleasedEntries(pending)).toEqual(["- Not yet dated.", "- Also not dated."]);
    expect(unreleasedEntries(dated)).toEqual([]);
  });

  test("returns null when the section is missing", () => {
    expect(unreleasedEntries("# Changelog\n\n## 2026-09-02\n- x\n")).toBeNull();
  });
});

describe("evaluateChangelog", () => {
  test("passes a release whose entries are dated and whose changelog moved", () => {
    expect(
      evaluateChangelog({
        files: ["app/lib/x.ts", "docs/CHANGELOG.md"],
        changelogText: dated,
      }),
    ).toEqual({ ok: true, problems: [] });
  });

  test("passes a docs-only change without touching the changelog", () => {
    expect(
      evaluateChangelog({ files: ["docs/README.md"], changelogText: dated }).ok,
    ).toBe(true);
  });

  test("fails behavior changes that skipped the changelog", () => {
    const result = evaluateChangelog({ files: ["app/lib/x.ts"], changelogText: dated });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/changed but docs\/CHANGELOG\.md did not/);
  });

  test("fails when Unreleased still holds entries", () => {
    const result = evaluateChangelog({
      files: ["app/lib/x.ts", "docs/CHANGELOG.md"],
      changelogText: pending,
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      expect.stringMatching(/still lists 2 Unreleased entries/),
    ]);
  });

  test("fails when the Unreleased section is missing", () => {
    const result = evaluateChangelog({
      files: ["docs/CHANGELOG.md"],
      changelogText: "# Changelog\n\n## 2026-09-02\n",
    });
    expect(result.problems).toEqual([expect.stringMatching(/no "## \[Unreleased\]"/)]);
  });
});
