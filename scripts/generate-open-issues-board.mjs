#!/usr/bin/env node
/* eslint-env node */
/**
 * Generate a job board of open CallCaster issues for coding agents.
 *
 * Fetches every open issue for chester-hill-solutions/callcaster through
 * `gh api graphql`, merges the Project #9 (CHS backlog) status and a hand-
 * reviewed enrichment ledger, and writes a Markdown board to ISSUE_BOARD.md.
 *
 * The board is VERDICT-driven: every issue is assigned to exactly one lane
 * by the enrichment verdict (fix-now / verify-close / needs-repro /
 * needs-decision / blocked-epic / duplicate). GitHub is never mutated.
 *
 * Usage:
 *   npm run tools:issues:board
 *   GITHUB_REPO=owner/repo npm run tools:issues:board
 *
 * Enrichment: scripts/issue-board-enrichment.json
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUTPUT = join(ROOT, "ISSUE_BOARD.md");
const REPO = process.env.GITHUB_REPO ?? "chester-hill-solutions/callcaster";
const BOARD_PROJECT_NUMBER = 9;
const REVIEWED_COMMIT = "f838c367";
const ENRICHMENT_PATH = join(import.meta.dirname, "issue-board-enrichment.json");
const enrichment = JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8"));

const LANES = [
  {
    key: "fix-now",
    label: "Fix now",
    blurb:
      "Confirmed defects or well-scoped features with an exact resolution path. Pick from here first.",
  },
  {
    key: "verify-close",
    label: "Verify and close",
    blurb:
      "Likely already fixed or working as designed. Run the listed verification, then close without new code.",
  },
  {
    key: "needs-repro",
    label: "Needs reproduction",
    blurb:
      "Diagnosis is incomplete or contradictory. Reproduce with evidence (screenshot, payload, trace) before coding.",
  },
  {
    key: "needs-decision",
    label: "Needs decision",
    blurb:
      "Product, security, or operations decision required before implementation can be scoped.",
  },
  {
    key: "blocked-epic",
    label: "Blocked / split first",
    blurb:
      "Blocked by other open issues, or too large for one agent. Split or unblock before assigning.",
  },
  {
    key: "duplicate",
    label: "Duplicates",
    blurb:
      "Same root cause as the linked canonical issue. Do not implement separately — fold scope in and close.",
  },
];

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
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `gh api failed with exit ${result.status}\n`);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

function fetchOpenIssues() {
  const issues = [];
  let cursor = null;
  let totalCount = 0;

  do {
    const payload = runGhApi(ISSUES_QUERY, {
      owner: REPO.split("/")[0],
      repo: REPO.split("/")[1],
      cursor,
    });
    const page = payload.data.repository.issues;
    totalCount = page.totalCount;
    issues.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return { issues, totalCount };
}

function statusOf(issue) {
  const item = issue.projectItems?.nodes?.find((n) => n.project?.number === BOARD_PROJECT_NUMBER);
  return item?.fieldValueByName?.name ?? null;
}

function labelsOf(issue) {
  return (issue.labels?.nodes ?? []).map((l) => l.name);
}

function assigneesOf(issue) {
  return (issue.assignees?.nodes ?? []).map((a) => a.login);
}

const RISK_WEIGHT = { high: 0, medium: 1, low: 2 };
const SIZE_WEIGHT = { XL: 0, L: 1, "M-L": 2, M: 3, "S-M": 4, S: 5, XS: 6 };

function issueEntry(issue, enrich, status) {
  const lines = [];
  const inProgress = status === "In progress";
  const assignees = assigneesOf(issue);
  const labels = labelsOf(issue);
  const meta = [`Verdict: **${enrich.verdictLabel}**`];
  if (enrich.size) meta.push(`Size: ${enrich.size}`);
  if (enrich.risk) meta.push(`Risk: ${enrich.risk}`);
  meta.push(`Labels: ${labels.length ? labels.join(", ") : "none"}`);
  meta.push(`Assignee: ${assignees.length ? `@${assignees.join(", @")}` : "none"}`);
  meta.push(`Updated: ${issue.updatedAt.slice(0, 10)}`);
  if (inProgress) meta.unshift("**IN PROGRESS**");

  lines.push(`### [#${issue.number}](${issue.url}) ${issue.title}`);
  lines.push(`- ${meta.join(" · ")}`);

  if (enrich.duplicateOf) {
    const canon = enrichment[String(enrich.duplicateOf)];
    lines.push(
      `- Duplicate of: [#${enrich.duplicateOf}](https://github.com/${REPO}/issues/${enrich.duplicateOf}) — ${canon?.recommendedTitle ?? canon?.summary ?? ""}`,
    );
  }
  if (enrich.recommendedTitle && enrich.recommendedTitle !== issue.title) {
    lines.push(`- Recommended title: **${enrich.recommendedTitle}**`);
  }
  if (enrich.summary) lines.push(`- ${enrich.summary}`);
  if (enrich.currentBehavior) lines.push(`- Current behavior: ${enrich.currentBehavior}`);
  if (enrich.rootCause) lines.push(`- Root cause: ${enrich.rootCause}`);
  if (enrich.resolution) lines.push(`- Resolution: ${enrich.resolution}`);
  if (enrich.lookIn?.length) {
    lines.push(`- Look in: ${enrich.lookIn.map((p) => `\`${p}\``).join(", ")}`);
  }
  if (enrich.existingTests?.length) {
    lines.push(`- Existing tests: ${enrich.existingTests.join("; ")}`);
  }
  if (enrich.missingTests?.length) {
    lines.push(`- Missing tests: ${enrich.missingTests.join("; ")}`);
  }
  if (enrich.acceptanceCriteria?.length) {
    lines.push(`- Done when: ${enrich.acceptanceCriteria.join("; ")}`);
  }
  if (enrich.trackerRecommendation) {
    lines.push(`- Tracker: ${enrich.trackerRecommendation}`);
  }
  return lines.join("\n");
}

function render(issues, totalCount) {
  const lanes = new Map(LANES.map((l) => [l.key, { ...l, entries: [] }]));
  const unseen = [];

  for (const issue of issues) {
    const enrich = enrichment[String(issue.number)];
    const status = statusOf(issue) ?? "No status";
    if (!enrich) {
      unseen.push(issue.number);
      continue;
    }
    const laneKey = enrich.verdict ?? "backlog";
    const lane = lanes.get(laneKey);
    if (!lane) {
      unseen.push(issue.number);
      continue;
    }
    lane.entries.push({ issue, enrich, status });
  }

  for (const lane of lanes.values()) {
    lane.entries.sort((a, b) => {
      if (lane.key === "fix-now") {
        const d =
          (RISK_WEIGHT[a.enrich.risk] ?? 2) - (RISK_WEIGHT[b.enrich.risk] ?? 2) ||
          (SIZE_WEIGHT[a.enrich.size] ?? 3) - (SIZE_WEIGHT[b.enrich.size] ?? 3);
        if (d !== 0) return d;
      }
      return b.issue.updatedAt.localeCompare(a.issue.updatedAt);
    });
  }

  const generated = new Date().toISOString();
  const sections = LANES.map((l) => {
    const lane = lanes.get(l.key);
    const body = lane.entries.length
      ? lane.entries.map((e) => issueEntry(e.issue, e.enrich, e.status)).join("\n\n")
      : "_None._";
    return `## ${l.label} — ${lane.entries.length}\n\n${l.blurb}\n\n${body}`;
  });

  const unassigned = unseen.length ? `\n\n> ⚠️ No enrichment entry: ${unseen.join(", ")}` : "";

  const md = `# CallCaster — Open Issue Board for Agents

Reviewed at \`dev@${REVIEWED_COMMIT}\` · Generated: ${generated} · ${totalCount} open issues in \`${REPO}\` · Refresh with \`npm run tools:issues:board\`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: \`gh issue view <number>\`.
3. Claim it: \`gh issue edit <number> --add-assignee @me\`.
4. Branch from \`dev\` via \`gh issue develop\`. Follow branch/PR rules in \`AGENTS.md\`.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
\`scripts/issue-board-enrichment.json\` — update that file when evidence changes.

---

${sections.join("\n\n---\n\n")}${unassigned}
`;

  return { md, counts: Object.fromEntries([...lanes.values()].map((l) => [l.key, l.entries.length])), unseen };
}

const { issues, totalCount } = fetchOpenIssues();
const { md, counts, unseen } = render(issues, totalCount);
writeFileSync(OUTPUT, md, "utf8");

const laneSummary = LANES.map((l) => `${l.label}: ${counts[l.key]}`).join(", ");
console.log(`[issues-board] ${totalCount} open issues → ${OUTPUT} (${laneSummary})`);
if (unseen.length) {
  console.warn(`[issues-board] ⚠️ ${unseen.length} issues without enrichment: ${unseen.join(", ")}`);
  process.exitCode = 2;
}
if (!existsSync(OUTPUT)) process.exitCode = 1;