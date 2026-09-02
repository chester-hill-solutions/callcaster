import { globToRegExp } from "./ci-changes-lib.mjs";

export const CHANGELOG_PATH = "docs/CHANGELOG.md";

/** Paths whose changes ship behavior and therefore need a changelog line. */
export const BEHAVIOR_PATTERNS = [
  "app/**",
  "server/**",
  "worker/**",
  "services/**",
  "shared/**",
  "vendor/**",
  "drizzle/**",
  "client/migrations/**",
];

const BEHAVIOR_RX = BEHAVIOR_PATTERNS.map(globToRegExp);

export function behaviorChanged(files) {
  return files.some((file) => BEHAVIOR_RX.some((rx) => rx.test(file)));
}

/** Bullet lines under `## [Unreleased]`, up to the next `## ` heading. */
export function unreleasedEntries(changelogText) {
  const lines = changelogText.split("\n");
  const start = lines.findIndex((line) => /^## \[Unreleased\]/.test(line));
  if (start < 0) return null;
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    if (/^\s*- /.test(line)) entries.push(line.trim());
  }
  return entries;
}

/**
 * Release-PR rule: behavior changes need the changelog touched, and the
 * Unreleased section must be empty because the release PR dates it.
 */
export function evaluateChangelog({ files, changelogText }) {
  const problems = [];
  const changelogTouched = files.includes(CHANGELOG_PATH);

  if (behaviorChanged(files) && !changelogTouched) {
    problems.push(
      `behavior files changed but ${CHANGELOG_PATH} did not — add the release's entries and date the section`,
    );
  }

  const entries = unreleasedEntries(changelogText);
  if (entries === null) {
    problems.push(`${CHANGELOG_PATH} has no "## [Unreleased]" section`);
  } else if (entries.length > 0) {
    problems.push(
      `${CHANGELOG_PATH} still lists ${entries.length} Unreleased entr${entries.length === 1 ? "y" : "ies"} — rename the section to "## YYYY-MM-DD — release #<PR>" and add an empty Unreleased above it`,
    );
  }

  return { ok: problems.length === 0, problems };
}
