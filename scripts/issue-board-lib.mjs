/**
 * Shared, side-effect-free logic for the agent issue board.
 *
 * Pure rendering and validation so the CLI stays a thin wrapper and the
 * interesting behaviour is unit-testable. No gh/fetch/fs/write calls here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const LANES = [
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

const LANE_KEYS = LANES.map((l) => l.key);
const VERDICT_LABELS = new Map(LANES.map((l) => [l.key, l.label]));
const SIZES = ["XS", "S", "S-M", "M", "M-L", "L", "L-XL", "XL"];
const RISKS = ["low", "medium", "high"];

export const ENRICHMENT_RECORD_SCHEMA = z
  .object({
    issueNumber: z.number().int().positive(),
    verdict: z.enum(LANE_KEYS),
    duplicateOf: z.number().int().positive().optional(),
    recommendedTitle: z.string().optional(),
    summary: z.string().optional(),
    currentBehavior: z.string().optional(),
    rootCause: z.string().optional(),
    resolution: z.string().optional(),
    lookIn: z.array(z.string()).default([]),
    existingTests: z.array(z.string()).default([]),
    missingTests: z.array(z.string()).default([]),
    acceptanceCriteria: z.array(z.string()).default([]),
    blockedBy: z.array(z.number().int().positive()).default([]),
    size: z.enum(SIZES).optional(),
    risk: z.enum(RISKS).optional(),
    trackerRecommendation: z.string().optional(),
  })
  .strict();

/**
 * Load and validate every lane file in a directory. Throws on duplicate
 * issue numbers, schema violations, unknown blockedBy targets, or cycles.
 */
export function loadEnrichment(dir) {
  const records = [];
  const byNumber = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`issue-board: ${file} must contain an array of records`);
    }
    for (const raw of parsed) {
      const record = ENRICHMENT_RECORD_SCHEMA.parse(raw);
      if (byNumber.has(record.issueNumber)) {
        throw new Error(
          `issue-board: duplicate issueNumber ${record.issueNumber} across lane files`,
        );
      }
      byNumber.set(record.issueNumber, record);
      records.push(record);
    }
  }
  validateBlockedBy(records, byNumber);
  return records;
}

function validateBlockedBy(records, byNumber) {
  for (const record of records) {
    for (const target of record.blockedBy) {
      if (!byNumber.has(target)) {
        throw new Error(
          `issue-board: #${record.issueNumber} blockedBy unknown issue ${target}`,
        );
      }
    }
    if (record.duplicateOf && !byNumber.has(record.duplicateOf)) {
      throw new Error(
        `issue-board: #${record.issueNumber} duplicateOf unknown issue ${record.duplicateOf}`,
      );
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (n) => {
    if (visited.has(n)) return;
    if (visiting.has(n)) {
      throw new Error(`issue-board: blockedBy cycle ${stack.concat(n).join(" -> ")}`);
    }
    visiting.add(n);
    stack.push(n);
    for (const d of byNumber.get(n).blockedBy) visit(d);
    stack.pop();
    visiting.delete(n);
    visited.add(n);
  };
  for (const record of records) visit(record.issueNumber);
}

const RISK_WEIGHT = { high: 0, medium: 1, low: 2 };
const SIZE_WEIGHT = { XL: 0, L: 1, "M-L": 2, M: 3, "S-M": 4, S: 5, XS: 6, "L-XL": 1 };

function statusOf(issue, projectNumber) {
  const item = issue.projectItems?.nodes?.find(
    (n) => n.project?.number === projectNumber,
  );
  return item?.fieldValueByName?.name ?? null;
}

function issueEntry(issue, record, status, repo) {
  const lines = [];
  const inProgress = status === "In progress";
  const assignees = (issue.assignees?.nodes ?? []).map((a) => a.login);
  const labels = (issue.labels?.nodes ?? []).map((l) => l.name);
  const meta = [`Verdict: **${VERDICT_LABELS.get(record.verdict)}**`];
  if (record.size) meta.push(`Size: ${record.size}`);
  if (record.risk) meta.push(`Risk: ${record.risk}`);
  meta.push(`Labels: ${labels.length ? labels.join(", ") : "none"}`);
  meta.push(`Assignee: ${assignees.length ? `@${assignees.join(", @")}` : "none"}`);
  meta.push(`Updated: ${issue.updatedAt.slice(0, 10)}`);
  if (inProgress) meta.unshift("**IN PROGRESS**");

  lines.push(`### [#${issue.number}](${issue.url}) ${issue.title}`);
  lines.push(`- ${meta.join(" · ")}`);

  if (record.duplicateOf) {
    lines.push(
      `- Duplicate of: [#${record.duplicateOf}](https://github.com/${repo}/issues/${record.duplicateOf})`,
    );
  }
  if (record.recommendedTitle && record.recommendedTitle !== issue.title) {
    lines.push(`- Recommended title: **${record.recommendedTitle}**`);
  }
  if (record.summary) lines.push(`- ${record.summary}`);
  if (record.currentBehavior) lines.push(`- Current behavior: ${record.currentBehavior}`);
  if (record.rootCause) lines.push(`- Root cause: ${record.rootCause}`);
  if (record.resolution) lines.push(`- Resolution: ${record.resolution}`);
  if (record.lookIn.length) {
    lines.push(`- Look in: ${record.lookIn.map((p) => `\`${p}\``).join(", ")}`);
  }
  if (record.blockedBy.length) {
    lines.push(
      `- Blocked by: ${record.blockedBy
        .map((n) => `[#${n}](https://github.com/${repo}/issues/${n})`)
        .join(", ")}`,
    );
  }
  if (record.existingTests.length) {
    lines.push(`- Existing tests: ${record.existingTests.join("; ")}`);
  }
  if (record.missingTests.length) {
    lines.push(`- Missing tests: ${record.missingTests.join("; ")}`);
  }
  if (record.acceptanceCriteria.length) {
    lines.push(`- Done when: ${record.acceptanceCriteria.join("; ")}`);
  }
  if (record.trackerRecommendation) {
    lines.push(`- Tracker: ${record.trackerRecommendation}`);
  }
  return lines.join("\n");
}

/**
 * Render the board markdown for a list of open issues and validated records.
 * Pure and deterministic: no timestamps, no I/O. Throws if any open issue is
 * missing an enrichment record or a record references a closed issue.
 */
export function buildBoard({ issues, records, repo, projectNumber, reviewedAt }) {
  const byNumber = new Map(records.map((r) => [r.issueNumber, r]));
  const openNumbers = new Set(issues.map((i) => i.number));

  const missing = issues.filter((i) => !byNumber.has(i.number)).map((i) => i.number);
  if (missing.length) {
    throw new Error(`issue-board: open issues without enrichment: ${missing.join(", ")}`);
  }
  const stale = records
    .filter((r) => !openNumbers.has(r.issueNumber))
    .map((r) => r.issueNumber);
  if (stale.length) {
    throw new Error(`issue-board: enrichment records for closed issues: ${stale.join(", ")}`);
  }

  const lanes = new Map(LANES.map((l) => [l.key, { ...l, entries: [] }]));
  for (const issue of issues) {
    const record = byNumber.get(issue.number);
    const status = statusOf(issue, projectNumber) ?? "No status";
    lanes.get(record.verdict).entries.push({ issue, record, status });
  }

  for (const lane of lanes.values()) {
    lane.entries.sort((a, b) => {
      if (lane.key === "fix-now") {
        const d =
          (RISK_WEIGHT[a.record.risk] ?? 2) - (RISK_WEIGHT[b.record.risk] ?? 2) ||
          (SIZE_WEIGHT[a.record.size] ?? 3) - (SIZE_WEIGHT[b.record.size] ?? 3);
        if (d !== 0) return d;
      }
      return b.issue.updatedAt.localeCompare(a.issue.updatedAt);
    });
  }

  const sections = LANES.map((l) => {
    const lane = lanes.get(l.key);
    const body = lane.entries.length
      ? lane.entries
          .map((e) => issueEntry(e.issue, e.record, e.status, repo))
          .join("\n\n")
      : "_None._";
    return `## ${l.label} — ${lane.entries.length}\n\n${l.blurb}\n\n${body}`;
  });

  const md = `# CallCaster — Open Issue Board for Agents

Reviewed at \`${reviewedAt}\` · ${issues.length} open issues in \`${repo}\` · Refresh with \`npm run tools:issues:board\`

## How to use this board

1. Pick from **Fix now** first (confirmed, with an exact resolution path).
2. Read the full issue before starting: \`gh issue view <number>\`.
3. Claim it: \`gh issue edit <number> --add-assignee @me\`.
4. Branch from \`dev\` via \`gh issue develop --base dev\`. Follow branch/PR rules in \`AGENTS.md\`.
5. Issues marked **Verify and close** need a verification pass, not new code.

Lane assignments, root causes, resolution paths, and test gaps come from the audit in
\`scripts/issue-board-enrichment/\` — update those files when evidence changes.

---

${sections.join("\n\n---\n\n")}
`;

  return { md, counts: Object.fromEntries([...lanes.values()].map((l) => [l.key, l.entries.length])) };
}