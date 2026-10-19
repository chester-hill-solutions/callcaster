#!/usr/bin/env node
/* eslint-env node */
/**
 * Apply verification verdicts to GitHub issue state and CHS backlog Status.
 *
 * The rule: an issue is closed because the code was VERIFIED to resolve the reported
 * symptom, not because a commit that mentions the issue number reached master.
 *
 *   VERIFIED + machine-checkable  -> close if open; on-prod if already there, else
 *                                    on-dev (the operator promotes to on-prod by hand)
 *   VERIFIED + only a human can
 *   confirm the symptom is gone   -> reopen; on-qa
 *   PARTIAL                       -> reopen; on-dev
 *   NOT_FIXED                     -> reopen; on-dev, or In progress when no fix exists
 *
 * Usage:
 *   node .opencode/tools/apply-issue-verdicts.mjs --verdicts <dir>
 *   node .opencode/tools/apply-issue-verdicts.mjs --verdicts <dir> --apply
 *   node .opencode/tools/apply-issue-verdicts.mjs --verdicts <dir> --issues 1,2,3
 *
 * Dry run by default. See .agents/skills/issue-fix-verification/SKILL.md.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const REPO = "chester-hill-solutions/callcaster";
const PROJECT_NUMBER = 9;
const PROJECT_ID = "PVT_kwDOCNShUM4BeAri";
const FIELD_ID = "PVTSSF_lADOCNShUM4BeArizhYeBKI";
const OPTIONS = {
  Backlog: "f75ad846",
  "In progress": "47fc9ee4",
  "on-dev": "9fd67429",
  "tested-on-dev": "eaff2ab1",
  "on-qa": "98236657",
  "on-prod": "2f691958",
  archive: "2441cbb1",
};

const argv = process.argv.slice(2);
const arg = (name) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
};
const APPLY = argv.includes("--apply");
const verdictsDir = arg("verdicts");
if (!verdictsDir) {
  console.error("--verdicts <dir> is required.");
  process.exit(2);
}
const scope = arg("issues") ? arg("issues").split(",").map((n) => Number(n.trim())) : null;
// Optional: a directory of briefs, one <issue>.json each, holding the candidate
// commits. It tells the tool whether a fix is in flight on dev but not master.
const briefsDir = arg("briefs");
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const gh = (args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

// ---------------------------------------------------------------- verdicts
const verdicts = [];
for (const file of readdirSync(verdictsDir)) {
  if (!file.endsWith(".json")) continue;
  const v = JSON.parse(readFileSync(path.join(verdictsDir, file), "utf8"));
  if (scope && !scope.includes(v.issue)) continue;
  verdicts.push(v);
}
verdicts.sort((a, b) => a.issue - b.issue);
if (verdicts.length === 0) {
  console.error("no verdicts found.");
  process.exit(2);
}

// ------------------------------------------------------- candidate commits
const verdictCandidates = new Map();
if (briefsDir) {
  for (const file of readdirSync(briefsDir)) {
    if (!file.endsWith(".json")) continue;
    const brief = JSON.parse(readFileSync(path.join(briefsDir, file), "utf8"));
    if (typeof brief.issue !== "number") continue;
    const shas = [
      ...(brief.candidate_commits ?? []).map((c) => c.sha),
      ...(brief.candidate_pr_commits ?? []).map((c) => c.sha),
    ].filter(Boolean);
    verdictCandidates.set(brief.issue, shas);
  }
}

// ------------------------------------------------------- current board state
const boardQuery = `
query($owner:String!,$num:Int!,$cursor:String!) {
  organization(login:$owner) {
    projectV2(number:$num) {
      items(first:100, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content { ... on Issue { number state repository { nameWithOwner } } }
          fieldValueByName(name:"Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }
  }
}`;
const board = new Map();
let cursor = "";
let more = true;
while (more) {
  const payload = JSON.parse(
    gh([
      "api",
      "graphql",
      "-f",
      `query=${boardQuery}`,
      "-F",
      "owner=chester-hill-solutions",
      "-F",
      `num=${PROJECT_NUMBER}`,
      "-F",
      `cursor=${cursor}`,
    ]),
  );
  const items = payload.data.organization.projectV2.items;
  for (const node of items.nodes) {
    const issue = node.content;
    if (!issue || issue.repository.nameWithOwner !== REPO) continue;
    board.set(issue.number, {
      state: issue.state,
      status: node.fieldValueByName?.name ?? null,
    });
  }
  more = items.pageInfo.hasNextPage;
  cursor = items.pageInfo.endCursor;
}

// ------------------------------------------------------------------ planning
/** A fix that exists on dev but not in master means the work is in flight. */
function hasDevOnlyFix(issue) {
  const shas = [];
  if (verdictCandidates.has(issue)) shas.push(...verdictCandidates.get(issue));
  for (const sha of shas) {
    try {
      if (git(["merge-base", "--is-ancestor", sha, "origin/master"])) continue;
      if (git(["merge-base", "--is-ancestor", sha, "origin/dev"])) return true;
    } catch {}
  }
  return false;
}

function plan(verdict, current) {
  if (verdict.verdict === "VERIFIED") {
    if (verdict.manual) {
      return {
        action: "reopen",
        status: "on-qa",
        why: "the fix is in master, but only a person can confirm the symptom is gone",
      };
    }
    return {
      action: "close",
      status: current.status === "on-prod" ? "on-prod" : "on-dev",
      why:
        current.status === "on-prod"
          ? "verified and already marked on-prod"
          : "verified by the code; the operator promotes to on-prod",
    };
  }
  if (verdict.verdict === "PARTIAL") {
    // A partial fix is not a completed fix, so it is unfinished work.
    return {
      action: "reopen",
      status: hasDevOnlyFix(verdict.issue) ? "on-dev" : "In progress",
      why: "the fix covers part of the symptom only",
    };
  }
  return {
    action: "reopen",
    status: hasDevOnlyFix(verdict.issue) ? "on-dev" : "In progress",
    why: "nothing in master resolves the reported symptom",
  };
}

// -------------------------------------------------------------------- apply
const itemIds = new Map();
function itemIdFor(number) {
  if (itemIds.has(number)) return itemIds.get(number);
  const payload = JSON.parse(
    gh([
      "api",
      "graphql",
      "-f",
      `query={repository(owner:"chester-hill-solutions",name:"callcaster"){issue(number:${number}){projectItems(first:10){nodes{id project{number}}}}}}`,
    ]),
  );
  const node = payload.data.repository.issue.projectItems.nodes.find(
    (n) => n.project.number === PROJECT_NUMBER,
  );
  const id = node ? node.id : null;
  itemIds.set(number, id);
  return id;
}

const rows = [];
for (const verdict of verdicts) {
  const current = board.get(verdict.issue);
  if (!current) {
    // The issue is not on the CHS backlog. Its state is still wrong, so the
    // reopen still happens; only the Status has nowhere to go.
    const issue = JSON.parse(gh(["api", `repos/${REPO}/issues/${verdict.issue}`]));
    const target =
      verdict.verdict === "VERIFIED"
        ? { action: "close", status: null, why: "verified by the code" }
        : {
            action: "reopen",
            status: null,
            why:
              verdict.verdict === "PARTIAL"
                ? "the fix covers part of the symptom only"
                : "nothing in master resolves the reported symptom",
          };
    const stateChange =
      target.action === "reopen" ? issue.state === "closed" : issue.state === "open";
    const row = {
      issue: verdict.issue,
      verdict: verdict.verdict,
      manual: Boolean(verdict.manual),
      from_state: issue.state,
      to_state: target.action === "reopen" ? "OPEN" : "CLOSED",
      from_status: null,
      to_status: null,
      stateChange,
      statusChange: false,
      why: target.why,
      notOnBoard: true,
    };
    rows.push(row);
    if (!APPLY) continue;
    if (stateChange) {
      gh([
        "api",
        "--method",
        "PATCH",
        `repos/${REPO}/issues/${verdict.issue}`,
        "-f",
        `state=${target.action === "reopen" ? "open" : "closed"}`,
      ]);
    }
    if (stateChange) {
      const body = [
        verdict.verdict === "VERIFIED"
          ? "Closed after verifying the fix: the code in `master` resolves the reported symptom."
          : "Reopened: the claimed fix does not resolve the reported symptom.",
        "",
        `**Verdict:** ${verdict.verdict}`,
        `**Finding:** ${verdict.mechanism ?? "none"}`,
        "",
        "**Evidence**",
        ...(verdict.evidence ?? []).map((e) => `- ${e}`),
        verdict.test ? `- test: ${verdict.test}` : null,
        verdict.note ? `- note: ${verdict.note}` : null,
        "",
        "_Verified against `origin/master` by reading the code, not by noticing that a commit reached master._",
      ]
        .filter((line) => line !== null)
        .join("\n");
      gh([
        "api",
        "--method",
        "POST",
        `repos/${REPO}/issues/${verdict.issue}/comments`,
        "-f",
        `body=${body}`,
      ]);
    }
    continue;
  }
  const target = plan(verdict, current);
  const stateChange =
    target.action === "reopen" ? current.state === "CLOSED" : current.state === "OPEN";
  const statusChange = target.status !== current.status;
  const row = {
    issue: verdict.issue,
    verdict: verdict.verdict,
    manual: Boolean(verdict.manual),
    from_state: current.state,
    to_state: target.action === "reopen" ? "OPEN" : "CLOSED",
    from_status: current.status,
    to_status: target.status,
    stateChange,
    statusChange,
    why: target.why,
  };
  rows.push(row);

  if (!APPLY) continue;

  if (stateChange) {
    gh([
      "api",
      "--method",
      "PATCH",
      `repos/${REPO}/issues/${verdict.issue}`,
      "-f",
      `state=${target.action === "reopen" ? "open" : "closed"}`,
    ]);
  }
  if (statusChange) {
    const id = itemIdFor(verdict.issue);
    if (!id) {
      console.error(`  ! #${verdict.issue} has no project item; status not set`);
    } else {
      // The field value is an input object. `gh api graphql` will not coerce a
      // JSON string into one, so the values go inline in the mutation.
      const mutation = [
        "mutation {",
        "  updateProjectV2ItemFieldValue(input: {",
        `    projectId: ${JSON.stringify(PROJECT_ID)},`,
        `    itemId: ${JSON.stringify(id)},`,
        `    fieldId: ${JSON.stringify(FIELD_ID)},`,
        `    value: { singleSelectOptionId: ${JSON.stringify(OPTIONS[target.status])} }`,
        "  }) { projectV2Item { id } }",
        "}",
      ].join("\n");
      gh(["api", "graphql", "-f", `query=${mutation}`]);
    }
  }
  if (row.stateChange || (verdict.manual && row.statusChange)) {
    const wasReopened = target.action === "reopen" && current.state === "CLOSED";
    const wasClosed = target.action === "close" && current.state === "OPEN";
    const headline = wasReopened
      ? {
          VERIFIED:
            "Reopened: the fix is in `master`, but only a person can confirm the symptom is gone.",
          PARTIAL: "Reopened: the fix covers part of the symptom only.",
          NOT_FIXED: "Reopened: the claimed fix does not resolve the reported symptom.",
        }[verdict.verdict]
      : wasClosed
        ? "Verified and closed: the code in `master` resolves the reported symptom."
        : "Status updated after verifying the claimed fix.";
    const label = {
      VERIFIED: "Mechanism",
      PARTIAL: "What is there",
      NOT_FIXED: "What is missing",
    }[verdict.verdict] ?? "Finding";
    const body = [
      headline,
      "",
      `**Verdict:** ${verdict.verdict}${verdict.manual ? " — needs a physical test" : ""}`,
      `**${label}:** ${verdict.mechanism ?? "none"}`,
      "",
      "**Evidence**",
      ...(verdict.evidence ?? []).map((e) => `- ${e}`),
      verdict.test ? `- test: ${verdict.test}` : null,
      verdict.note ? `- note: ${verdict.note}` : null,
      "",
      `**Status set to \`${target.status}\`** — ${target.why}.`,
      "",
      "_Verified against `origin/master` by reading the code, not by noticing that a commit reached master._",
    ]
      .filter((line) => line !== null)
      .join("\n");
    gh([
      "api",
      "--method",
      "POST",
      `repos/${REPO}/issues/${verdict.issue}/comments`,
      "-f",
      `body=${body}`,
    ]);
  }
}

// ------------------------------------------------------------------- report
const counts = new Map();
for (const row of rows) {
  if (row.skipped) continue;
  const key = `${row.verdict}${row.manual ? " + manual" : ""} -> ${row.to_state} / ${row.to_status}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
console.log(`verdicts: ${verdicts.length}   mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
for (const [key, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${key}`);
}
const changed = rows.filter((r) => !r.skipped && (r.stateChange || r.statusChange));
console.log(`\nchanges: ${changed.length}`);
for (const row of changed) {
  console.log(
    `  #${row.issue} ${row.from_state}->${row.to_state}  ${row.from_status}->${row.to_status}  (${row.verdict}${row.manual ? " + manual" : ""})`,
  );
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN — pass --apply to write"}`);
