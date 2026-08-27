#!/usr/bin/env node
/* eslint-env node */
/**
 * Generate the agent issue board (CLI wrapper; logic lives in issue-board-lib.mjs).
 *
 * Reads live open issues via `gh api graphql`, loads the validated enrichment
 * lane files, and atomically writes ISSUE_BOARD.md. Nothing is written unless
 * every open issue is covered and all records validate.
 *
 * Usage:
 *   npm run tools:issues:board
 *   GITHUB_REPO=owner/repo npm run tools:issues:board
 *   BOARD_REVIEWED_COMMIT=<sha> npm run tools:issues:board   # override git HEAD
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildBoard, loadEnrichment } from "./issue-board-lib.mjs";

const ROOT = join(import.meta.dirname, "..");
const OUTPUT = join(ROOT, "ISSUE_BOARD.md");
const TMP_OUTPUT = `${OUTPUT}.tmp`;
const ENRICHMENT_DIR = join(import.meta.dirname, "issue-board-enrichment");
const REPO = process.env.GITHUB_REPO ?? "chester-hill-solutions/callcaster";
const BOARD_PROJECT_NUMBER = 9;

const ISSUES_QUERY = `
query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(
      first: 100
      after: $cursor
      states: OPEN
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        updatedAt
        assignees(first: 10) { nodes { login } }
        labels(first: 20) { nodes { name } }
        projectItems(first: 20) {
          nodes {
            project { number }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }
}
`;

function runGhApi(query, variables) {
  const result = spawnSync(
    "gh",
    ["api", "graphql", "-f", `query=${query}`, "-f", `owner=${variables.owner}`, "-f", `repo=${variables.repo}`, "-f", `cursor=${variables.cursor ?? ""}`],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh api failed with exit ${result.status}`);
  }
  const payload = JSON.parse(result.stdout);
  if (payload.errors?.length) {
    throw new Error(`gh api returned errors: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  return payload;
}

function fetchOpenIssues() {
  const [owner, repo] = REPO.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO must be owner/repo, got "${REPO}"`);
  }
  const issues = [];
  const seen = new Set();
  let cursor = null;
  let totalCount = null;

  do {
    const payload = runGhApi(ISSUES_QUERY, { owner, repo, cursor });
    const page = payload.data.repository.issues;
    totalCount = page.totalCount;
    for (const issue of page.nodes) {
      if (seen.has(issue.number)) {
        throw new Error(`issue-board: duplicate issue ${issue.number} across pages`);
      }
      seen.add(issue.number);
      issues.push(issue);
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  if (issues.length !== totalCount) {
    throw new Error(
      `issue-board: fetched ${issues.length} issues but GitHub reports ${totalCount}`,
    );
  }
  return issues;
}

function reviewedAt() {
  if (process.env.BOARD_REVIEWED_COMMIT) return `dev@${process.env.BOARD_REVIEWED_COMMIT}`;
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return "dev@unknown";
  return `dev@${result.stdout.trim()}`;
}

function main() {
  const issues = fetchOpenIssues();
  const records = loadEnrichment(ENRICHMENT_DIR);
  const { md, counts } = buildBoard({
    issues,
    records,
    repo: REPO,
    projectNumber: BOARD_PROJECT_NUMBER,
    reviewedAt: reviewedAt(),
  });

  // Validate everything before touching the tracked output; then swap atomically.
  writeFileSync(TMP_OUTPUT, md, "utf8");
  renameSync(TMP_OUTPUT, OUTPUT);

  const laneSummary = Object.entries(counts)
    .map(([key, n]) => `${key}: ${n}`)
    .join(", ");
  console.log(`[issues-board] ${issues.length} open issues → ${OUTPUT} (${laneSummary})`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[issues-board] ${error.message}\n`);
  if (existsSync(TMP_OUTPUT)) {
    // never leave a partial write that could be mistaken for the real board
  }
  process.exit(1);
}